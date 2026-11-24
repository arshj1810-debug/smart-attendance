import { Router } from 'express';
import crypto from 'crypto';
import { config } from '../config.js';
import { one, many, query, tx } from '../db.js';
import { wrap, fail, auth, audit, dateLabel, dateLong } from '../lib/util.js';
import { getSetting } from '../lib/settings.js';
import { checkEnv } from '../lib/verify.js';
import { emitAll, emitStaff, emitUser } from '../lib/realtime.js';
import { lowAttendanceAlerts, notifyUser } from '../lib/alerts.js';

const r = Router();
const STATUSES = ['Present', 'Absent', 'Late'];
const sign = (p) => crypto.createHmac('sha256', config.qrSecret).update(p).digest('base64url');

const SESSION_SQL = `SELECT s.session_id, s.course_id, s.faculty_id, s.time_label, s.room, s.kind, s.started_at, s.ended_at, c.course_code, c.course_name, f.name AS faculty_name
  FROM attendance_sessions s JOIN courses c ON c.course_id = s.course_id JOIN users f ON f.user_id = s.faculty_id`;

// Turns session rows into the API shape; marks/roster are fetched for all sessions in one query.
async function views(rows, { marks = true, onlyStudent = null } = {}) {
  if (!rows.length) return [];
  const ids = rows.map((s) => s.session_id);
  const recs = await many(`SELECT r.session_id, u.code, u.name, r.status FROM attendance_records r JOIN users u ON u.user_id = r.student_id WHERE r.session_id = ANY($1::int[]) ORDER BY u.code`, [ids]);
  const by = new Map(ids.map((i) => [i, []])); recs.forEach((x) => by.get(x.session_id).push(x));
  const { length } = await getSetting('system');
  return rows.map((s) => {
    const list = by.get(s.session_id);
    const ended = s.ended_at ? new Date(s.ended_at).getTime() : null;
    const v = {
      id: String(s.session_id), courseId: s.course_id, code: s.course_code, name: s.course_name, room: s.room, time: s.time_label, faculty: s.faculty_name, kind: s.kind,
      startedAt: new Date(s.started_at).getTime(), endedAt: ended, date: dateLabel(ended || s.started_at), durationMin: length,
      present: list.filter((x) => x.status !== 'Absent').length, total: list.length,
      locked: !!ended && Date.now() - ended > config.editWindowMs,
    };
    if (onlyStudent) v.marks = Object.fromEntries(list.filter((x) => x.code === onlyStudent).map((x) => [x.code, x.status]));
    else if (marks) { v.marks = Object.fromEntries(list.map((x) => [x.code, x.status])); v.roster = list.map((x) => ({ id: x.code, name: x.name })); }
    return v;
  });
}
const loadSession = (id) => (/^\d+$/.test(String(id)) ? one(`${SESSION_SQL} WHERE s.session_id = $1`, [id]) : null);
const canManage = (s, u) => u.role === 'admin' || s.faculty_id === u.uid;

r.post('/sessions/create', auth('faculty'), wrap(async (req, res) => {
  const code = String(req.body.code || '').trim();
  if (!code) throw fail(400, 'Course code is required.');
  const course = await one('SELECT * FROM courses WHERE course_code = $1', [code]);
  if (!course) throw fail(404, 'Course not found.');
  if (course.assigned_faculty_id !== req.user.uid) throw fail(403, 'You can only start sessions for courses assigned to you.');
  const active = await one('SELECT 1 FROM attendance_sessions WHERE faculty_id = $1 AND ended_at IS NULL', [req.user.uid]);
  if (active) throw fail(409, 'End your active session before starting another.');
  const id = await tx(async (c) => {
    const s = (await c.query(`INSERT INTO attendance_sessions (course_id, faculty_id, time_label, room) VALUES ($1,$2,$3,$4) RETURNING session_id`,
      [course.course_id, req.user.uid, String(req.body.time || '').slice(0, 40), String(req.body.room || '').slice(0, 40)])).rows[0];
    // Everyone enrolled starts as Absent, so an unmarked student is counted as absent when the session ends.
    await c.query(`INSERT INTO attendance_records (session_id, student_id, status, method)
                   SELECT $1::int, e.student_id, 'Absent', 'auto' FROM enrollments e JOIN users u ON u.user_id = e.student_id AND u.status = 'Active' WHERE e.course_id = $2`, [s.session_id, course.course_id]);
    return s.session_id;
  });
  audit('session_start', req.user.id, `${code} #${id}`);
  emitAll('session:changed');
  res.status(201).json((await views([await loadSession(id)]))[0]);
}));

r.get('/sessions/active', auth(), wrap(async (req, res) => {
  const u = req.user; let row;
  if (u.role === 'faculty') row = await one(`${SESSION_SQL} WHERE s.ended_at IS NULL AND s.faculty_id = $1 ORDER BY s.started_at DESC LIMIT 1`, [u.uid]);
  else if (u.role === 'admin') row = await one(`${SESSION_SQL} WHERE s.ended_at IS NULL ORDER BY s.started_at DESC LIMIT 1`);
  else row = await one(`${SESSION_SQL} WHERE s.ended_at IS NULL AND s.course_id IN (SELECT course_id FROM enrollments WHERE student_id = $1) ORDER BY s.started_at DESC LIMIT 1`, [u.uid]);
  if (!row) return res.json({ session: null });
  res.json({ session: (await views([row], { onlyStudent: u.role === 'student' ? u.id : null }))[0] });
}));

r.get('/sessions/past', auth('faculty', 'admin'), wrap(async (req, res) => {
  const rows = req.user.role === 'admin'
    ? await many(`${SESSION_SQL} WHERE s.ended_at IS NOT NULL ORDER BY s.ended_at DESC LIMIT 100`)
    : await many(`${SESSION_SQL} WHERE s.ended_at IS NOT NULL AND s.faculty_id = $1 ORDER BY s.ended_at DESC LIMIT 100`, [req.user.uid]);
  res.json({ sessions: await views(rows) });
}));

r.post('/sessions/:id/end', auth('faculty'), wrap(async (req, res) => {
  const s = await loadSession(req.params.id);
  if (!s || s.faculty_id !== req.user.uid) throw fail(404, 'Session not found.');
  if (!s.ended_at) {
    await query('UPDATE attendance_sessions SET ended_at = now() WHERE session_id = $1 AND ended_at IS NULL', [s.session_id]);
    audit('session_end', req.user.id, `${s.course_code} #${s.session_id}`);
    lowAttendanceAlerts(s.course_id).catch((e) => console.error('[alerts]', e.message));
  }
  emitAll('session:changed');
  res.json((await views([await loadSession(req.params.id)]))[0]);
}));

// Faculty polls this every 2 seconds. Each token is HMAC-signed, bound to the session and expires after qrTtlMs.
r.get('/sessions/:id/qr', auth('faculty'), wrap(async (req, res) => {
  const s = await loadSession(req.params.id);
  if (!s || s.faculty_id !== req.user.uid || s.ended_at) throw fail(404, 'This session is not active.');
  const exp = Date.now() + config.qrTtlMs, p = `${s.session_id}.${crypto.randomBytes(6).toString('base64url')}.${exp}`;
  res.json({ token: `${p}.${sign(p)}`, expiresAt: exp });
}));

r.post('/attendance/scan', auth('student'), wrap(async (req, res) => {
  const reject = (message, why) => { audit('scan_rejected', req.user.id, why); return res.status(400).json({ ok: false, message }); };
  const [sid, nonce, exp, sig] = String(req.body.token || '').trim().replace(/^ATT1:/, '').split('.');
  if (!sid || !nonce || !exp || !sig) return reject('This is not an attendance QR code.', 'malformed');
  const want = Buffer.from(sign(`${sid}.${nonce}.${exp}`)), got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return reject('This QR code is not valid.', 'bad_signature');
  const s = await loadSession(sid);
  if (!s || s.ended_at) return reject('This session is no longer active.', 'inactive');
  if (Date.now() > Number(exp) + config.qrGraceMs) return reject('This code has expired. Scan the code now on screen.', 'expired');
  const enrolled = await one('SELECT 1 FROM enrollments WHERE student_id = $1 AND course_id = $2', [req.user.uid, s.course_id]);
  if (!enrolled) return reject('You are not enrolled in this course.', 'not_enrolled');
  const env = checkEnv(req, await getSetting('verification'), req.body);
  if (!env.ok) return reject(!env.network.ok ? env.network.message : env.gps.message, `env_failed:${!env.network.ok ? 'network' : 'gps'}`);
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const { late } = await getSetting('system');

  const out = await tx(async (c) => {
    const rec = (await c.query('SELECT status FROM attendance_records WHERE session_id = $1 AND student_id = $2 FOR UPDATE', [s.session_id, req.user.uid])).rows[0];
    if (rec && rec.status !== 'Absent') return { already: true, status: rec.status };
    // Atomic single-use check: the nonce primary key makes a second use of the same code fail.
    const used = await c.query('INSERT INTO qr_used_tokens (nonce, session_id, student_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING nonce', [nonce, s.session_id, req.user.uid]);
    if (!used.rowCount) return { replay: true };
    const status = Date.now() - new Date(s.started_at).getTime() > late * 60000 ? 'Late' : 'Present';
    await c.query(`INSERT INTO attendance_records (session_id, student_id, status, method) VALUES ($1,$2,$3,'qr')
                   ON CONFLICT (session_id, student_id) DO UPDATE SET status = EXCLUDED.status, method = 'qr', marked_at = now()`, [s.session_id, req.user.uid, status]);
    return { status };
  });
  if (out.replay) return reject('This code was already used. Scan the code now on screen.', 'replay');
  if (out.already) return res.json({ ok: true, already: true, subject: s.course_name, time, status: out.status, message: `Your attendance for ${s.course_name} is already recorded.` });
  audit('scan_ok', req.user.id, `#${s.session_id}`);
  emitStaff('attendance:update', { sessionId: String(s.session_id) });
  emitUser(req.user.id, 'attendance:changed', {});
  notifyUser(req.user.uid, req.user.id, { title: 'Attendance recorded', body: `Your attendance for ${s.course_name} was recorded as ${out.status} at ${time}.` }).catch(() => {});
  res.json({ ok: true, subject: s.course_name, time, status: out.status, message: `Attendance recorded as ${out.status} for ${s.course_name} at ${time}.` });
}));

// Manual marking / bulk submit / editing a saved session inside the edit window.
// Accepts { sessionId, records: [{studentId, status}] } or the single form { sessionId, studentId, status }.
r.post('/attendance/mark', auth('faculty', 'admin'), wrap(async (req, res) => {
  const { sessionId } = req.body;
  const records = Array.isArray(req.body.records) ? req.body.records : req.body.studentId ? [{ studentId: req.body.studentId, status: req.body.status }] : null;
  const s = await loadSession(sessionId);
  if (!s || !canManage(s, req.user)) throw fail(404, 'Session not found.');
  if (s.ended_at && Date.now() - new Date(s.ended_at).getTime() > config.editWindowMs) throw fail(403, 'This session is past the edit window.');
  if (!records || !records.length || records.some((x) => !STATUSES.includes(x.status))) throw fail(400, 'Invalid attendance records. Status must be Present, Absent or Late.');
  const codes = [...new Set(records.map((x) => String(x.studentId)))];
  const students = await many(`SELECT u.user_id, u.code FROM users u JOIN enrollments e ON e.student_id = u.user_id AND e.course_id = $1 WHERE u.code = ANY($2::text[])`, [s.course_id, codes]);
  if (students.length !== codes.length) throw fail(400, 'One or more students are not enrolled in this course.');
  const idOf = new Map(students.map((x) => [x.code, x.user_id])), last = new Map(records.map((x) => [String(x.studentId), x.status]));
  await tx(async (c) => {
    for (const [code, status] of last) {
      await c.query(`INSERT INTO attendance_records (session_id, student_id, status, method) VALUES ($1,$2,$3,'manual')
                     ON CONFLICT (session_id, student_id) DO UPDATE SET status = EXCLUDED.status, method = 'manual', marked_at = now()`, [s.session_id, idOf.get(code), status]);
    }
  });
  audit('attendance_override', req.user.id, `#${s.session_id} (${last.size})`);
  emitStaff('attendance:update', { sessionId: String(s.session_id) });
  for (const code of last.keys()) emitUser(code, 'attendance:changed', {});
  if (s.ended_at) lowAttendanceAlerts(s.course_id).catch(() => {});
  res.json((await views([await loadSession(sessionId)]))[0]);
}));

// A student's own history (every counted entry, newest first).
r.get('/attendance/me', auth('student'), wrap(async (req, res) => {
  const rows = await many(
    `SELECT ca.record_id, ca.status, ca.started_at, ca.session_date, c.course_code, c.course_name, s.kind
       FROM counted_attendance ca JOIN courses c ON c.course_id = ca.course_id JOIN attendance_sessions s ON s.session_id = ca.session_id
      WHERE ca.student_id = $1 ORDER BY ca.started_at DESC, ca.record_id DESC`, [req.user.uid]);
  res.json({ records: rows.map((x) => ({ id: String(x.record_id), subject: x.course_name, code: x.course_code, date: dateLong(x.started_at), session: x.kind, status: x.status })) });
}));

export default r;
