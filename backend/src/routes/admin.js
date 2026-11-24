import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { one, many, query, tx } from '../db.js';
import { wrap, fail, auth, audit, pct1, str, isEmail, toInt, dateLong } from '../lib/util.js';
import { emitAll, emitUser, emitStaff } from '../lib/realtime.js';

const r = Router();
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hash = (p) => bcrypt.hashSync(p || config.defaultPassword, 10);
const pw = (v) => { const p = String(v || ''); if (p && p.length < 8) throw fail(400, 'Password must be at least 8 characters.'); return p; };

// Register CRUD + CSV bulk import for one resource under /api/admin/<name>.
function mount(name, { list, create, update, remove }) {
  r.get(`/admin/${name}`, auth('admin'), wrap(async (_q, res) => res.json({ rows: await list() })));
  r.post(`/admin/${name}`, auth('admin'), wrap(async (req, res) => res.status(201).json(await create(req.body, req.user))));
  r.post(`/admin/${name}/bulk`, auth('admin'), wrap(async (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 2000) : [];
    let created = 0; const errors = [];
    for (const [i, row] of rows.entries()) { try { await create(row, req.user); created++; } catch (e) { errors.push({ row: i + 1, message: e.status ? e.message : e.code === '23505' ? 'Duplicate ID or email.' : 'Invalid row.' }); } }
    res.json({ created, skipped: errors.length, errors: errors.slice(0, 20) });
  }));
  r.put(`/admin/${name}/:id`, auth('admin'), wrap(async (req, res) => res.json(await update(req.params.id, req.body, req.user))));
  r.delete(`/admin/${name}/:id`, auth('admin'), wrap(async (req, res) => res.json(await remove(req.params.id, req.user))));
}

// ---------------- Students
const STUDENT_SQL = `SELECT u.*, COALESCE(a.total, 0)::int AS total, COALESCE(a.att, 0)::int AS att
  FROM users u LEFT JOIN (SELECT student_id, COUNT(*) AS total, COUNT(*) FILTER (WHERE status IN ('Present','Late')) AS att FROM counted_attendance GROUP BY student_id) a ON a.student_id = u.user_id
  WHERE u.role = 'student'`;
const studentShape = (u) => ({ id: u.code, name: u.name, email: u.email, department: u.department, course: u.program, semester: u.semester, total: u.total, attended: u.att, percentage: pct1(u.att, u.total), status: u.status });
const autoEnroll = (c, userId, dept, sem) => (sem == null ? null : c.query(`INSERT INTO enrollments (student_id, course_id) SELECT $1::int, course_id FROM courses WHERE department = $2::text AND semester = $3::int ON CONFLICT DO NOTHING`, [userId, dept, sem]));
const status = (v) => (v === 'Inactive' ? 'Inactive' : 'Active');
function checkPerson(b, { needSem }) {
  const code = str(b.id), name = str(b.name), email = str(b.email).toLowerCase();
  if (!code || !name) throw fail(400, 'ID and name are required.');
  if (!isEmail(email)) throw fail(400, 'Enter a valid email address.');
  const sem = needSem ? toInt(b.semester) : null;
  if (needSem && (sem == null || sem < 1 || sem > 12)) throw fail(400, 'Semester must be a number between 1 and 12.');
  return { code, name, email, sem };
}
mount('students', {
  list: async () => (await many(`${STUDENT_SQL} ORDER BY u.code`)).map(studentShape),
  create: async (b) => {
    const { code, name, email, sem } = checkPerson(b, { needSem: true });
    const dept = str(b.department), password = pw(b.password);
    const id = await tx(async (c) => {
      const u = (await c.query(`INSERT INTO users (code, name, email, password_hash, role, department, program, semester, status) VALUES ($1,$2,$3,$4,'student',$5,$6,$7,$8) RETURNING user_id`, [code, name, email, hash(password), dept, str(b.course), sem, status(b.status)])).rows[0];
      await autoEnroll(c, u.user_id, dept, sem); return u.user_id;
    });
    audit('student_create', 'admin', `${code} ${name}`);
    return studentShape(await one(`${STUDENT_SQL} AND u.user_id = $1`, [id]));
  },
  update: async (code, b) => {
    const cur = await one(`SELECT * FROM users WHERE code = $1 AND role = 'student'`, [code]); if (!cur) throw fail(404, 'Student not found.');
    const { name, email, sem } = checkPerson({ ...b, id: code }, { needSem: true }); const dept = str(b.department), password = pw(b.password);
    await tx(async (c) => {
      await c.query(`UPDATE users SET name=$1, email=$2, department=$3, program=$4, semester=$5, status=$6 ${password ? ', password_hash=$8' : ''} WHERE user_id=$7`, [name, email, dept, str(b.course), sem, status(b.status), cur.user_id, ...(password ? [hash(password)] : [])]);
      await autoEnroll(c, cur.user_id, dept, sem);
    });
    audit('student_update', 'admin', `${code} ${name}`);
    return studentShape(await one(`${STUDENT_SQL} AND u.user_id = $1`, [cur.user_id]));
  },
  remove: async (code) => {
    const d = await one(`DELETE FROM users WHERE code = $1 AND role = 'student' RETURNING name`, [code]); if (!d) throw fail(404, 'Student not found.');
    audit('student_delete', 'admin', `${code} ${d.name}`); emitAll('session:changed'); return { ok: true };
  },
});

// ---------------- Faculty
const FACULTY_SQL = `SELECT u.*, COALESCE((SELECT string_agg(c.course_code, ', ' ORDER BY c.course_code) FROM courses c WHERE c.assigned_faculty_id = u.user_id), '') AS courses FROM users u WHERE u.role = 'faculty'`;
const facultyShape = (u) => ({ id: u.code, name: u.name, email: u.email, department: u.department, courses: u.courses, status: u.status });
mount('faculty', {
  list: async () => (await many(`${FACULTY_SQL} ORDER BY u.code`)).map(facultyShape),
  create: async (b) => {
    const { code, name, email } = checkPerson(b, { needSem: false });
    const u = await one(`INSERT INTO users (code, name, email, password_hash, role, department, status) VALUES ($1,$2,$3,$4,'faculty',$5,$6) RETURNING user_id`, [code, name, email, hash(pw(b.password)), str(b.department), status(b.status)]);
    audit('faculty_create', 'admin', `${code} ${name}`);
    return facultyShape(await one(`${FACULTY_SQL} AND u.user_id = $1`, [u.user_id]));
  },
  update: async (code, b) => {
    const cur = await one(`SELECT * FROM users WHERE code = $1 AND role = 'faculty'`, [code]); if (!cur) throw fail(404, 'Faculty member not found.');
    const { name, email } = checkPerson({ ...b, id: code }, { needSem: false }); const password = pw(b.password);
    await query(`UPDATE users SET name=$1, email=$2, department=$3, status=$4 ${password ? ', password_hash=$6' : ''} WHERE user_id=$5`, [name, email, str(b.department), status(b.status), cur.user_id, ...(password ? [hash(password)] : [])]);
    audit('faculty_update', 'admin', `${code} ${name}`);
    return facultyShape(await one(`${FACULTY_SQL} AND u.user_id = $1`, [cur.user_id]));
  },
  remove: async (code) => {
    const cur = await one(`SELECT user_id, name FROM users WHERE code = $1 AND role = 'faculty'`, [code]); if (!cur) throw fail(404, 'Faculty member not found.');
    const used = await one('SELECT 1 FROM attendance_sessions WHERE faculty_id = $1 LIMIT 1', [cur.user_id]);
    if (used) { await query(`UPDATE users SET status = 'Inactive' WHERE user_id = $1`, [cur.user_id]); audit('faculty_update', 'admin', `${code} deactivated (has attendance history)`); return { ok: true, deactivated: true }; }
    await query('DELETE FROM users WHERE user_id = $1', [cur.user_id]); audit('faculty_delete', 'admin', `${code} ${cur.name}`); return { ok: true };
  },
});

// ---------------- Courses
const COURSE_SQL = `SELECT c.*, f.name AS faculty_name, (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.course_id)::int AS students FROM courses c LEFT JOIN users f ON f.user_id = c.assigned_faculty_id`;
const courseRow = (c) => ({ id: c.course_code, name: c.course_name, department: c.department, faculty: c.faculty_name || '', semester: c.semester, students: c.students });
async function facultyIdByName(name) {
  if (!name) return null;
  const f = await one(`SELECT user_id FROM users WHERE role = 'faculty' AND lower(name) = lower($1) ORDER BY (status = 'Active') DESC LIMIT 1`, [name]);
  if (!f) throw fail(400, `No faculty member named "${name}".`); return f.user_id;
}
const syncCourseEnrollments = (c, courseId, dept, sem) => c.query(`INSERT INTO enrollments (student_id, course_id) SELECT user_id, $1::int FROM users WHERE role = 'student' AND status = 'Active' AND department = $2::text AND semester = $3::int ON CONFLICT DO NOTHING`, [courseId, dept, sem]);
mount('courses', {
  list: async () => (await many(`${COURSE_SQL} ORDER BY c.course_code`)).map(courseRow),
  create: async (b) => {
    const code = str(b.id).toUpperCase(), name = str(b.name), dept = str(b.department), sem = toInt(b.semester);
    if (!code || !name) throw fail(400, 'Course code and name are required.');
    if (sem == null || sem < 1 || sem > 12) throw fail(400, 'Semester must be a number between 1 and 12.');
    const fid = await facultyIdByName(str(b.faculty));
    const id = await tx(async (c) => {
      const row = (await c.query(`INSERT INTO courses (course_code, course_name, department, semester, assigned_faculty_id) VALUES ($1,$2,$3,$4,$5) RETURNING course_id`, [code, name, dept, sem, fid])).rows[0];
      await syncCourseEnrollments(c, row.course_id, dept, sem); return row.course_id;
    });
    audit('course_create', 'admin', `${code} ${name}`);
    return courseRow(await one(`${COURSE_SQL} WHERE c.course_id = $1`, [id]));
  },
  update: async (code, b) => {
    const cur = await one('SELECT * FROM courses WHERE course_code = $1', [code]); if (!cur) throw fail(404, 'Course not found.');
    const name = str(b.name), dept = str(b.department), sem = toInt(b.semester);
    if (!name) throw fail(400, 'Course name is required.');
    if (sem == null || sem < 1 || sem > 12) throw fail(400, 'Semester must be a number between 1 and 12.');
    const fid = await facultyIdByName(str(b.faculty));
    await tx(async (c) => {
      await c.query('UPDATE courses SET course_name=$1, department=$2, semester=$3, assigned_faculty_id=$4 WHERE course_id=$5', [name, dept, sem, fid, cur.course_id]);
      await syncCourseEnrollments(c, cur.course_id, dept, sem);
    });
    audit('course_update', 'admin', `${code} ${name}`);
    return courseRow(await one(`${COURSE_SQL} WHERE c.course_id = $1`, [cur.course_id]));
  },
  remove: async (code) => {
    const d = await one('DELETE FROM courses WHERE course_code = $1 RETURNING course_name', [code]); if (!d) throw fail(404, 'Course not found.');
    audit('course_delete', 'admin', `${code} ${d.course_name}`); emitAll('session:changed'); return { ok: true };
  },
});

// ---------------- Timetable
const SLOT_SQL = `SELECT t.slot_id, t.day, t.time_slot, t.room, c.course_code, c.course_name, f.name AS faculty_name FROM timetable_slots t JOIN courses c ON c.course_id = t.course_id LEFT JOIN users f ON f.user_id = c.assigned_faculty_id`;
const slotRow = (t) => ({ id: String(t.slot_id), day: t.day, time: t.time_slot, course: `${t.course_code} · ${t.course_name}`, faculty: t.faculty_name || '', room: t.room });
async function slotInput(b) {
  const day = str(b.day), time = str(b.time), code = str(b.course).split('·')[0].trim();
  if (!DAYS.includes(day)) throw fail(400, 'Choose a valid day.');
  if (!time) throw fail(400, 'Enter the time, for example 09:00–09:50.');
  const course = await one('SELECT course_id FROM courses WHERE course_code = $1', [code]); if (!course) throw fail(400, 'Choose a valid course.');
  return { day, time, room: str(b.room), courseId: course.course_id };
}
mount('timetable', {
  list: async () => (await many(`${SLOT_SQL} ORDER BY array_position(ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'], t.day), t.time_slot`)).map(slotRow),
  create: async (b) => { const s = await slotInput(b); const row = await one('INSERT INTO timetable_slots (course_id, day, time_slot, room) VALUES ($1,$2,$3,$4) RETURNING slot_id', [s.courseId, s.day, s.time, s.room]); return slotRow(await one(`${SLOT_SQL} WHERE t.slot_id = $1`, [row.slot_id])); },
  update: async (id, b) => { const s = await slotInput(b); const row = await one('UPDATE timetable_slots SET course_id=$1, day=$2, time_slot=$3, room=$4 WHERE slot_id=$5 RETURNING slot_id', [s.courseId, s.day, s.time, s.room, toInt(id, -1)]); if (!row) throw fail(404, 'Class slot not found.'); return slotRow(await one(`${SLOT_SQL} WHERE t.slot_id = $1`, [row.slot_id])); },
  remove: async (id) => { const d = await one('DELETE FROM timetable_slots WHERE slot_id = $1 RETURNING slot_id', [toInt(id, -1)]); if (!d) throw fail(404, 'Class slot not found.'); return { ok: true }; },
});

// ---------------- Attendance records (admin can review and correct a status)
const REC_SQL = `SELECT ca.record_id, ca.status, ca.started_at, u.code, u.name, c.course_name FROM counted_attendance ca JOIN users u ON u.user_id = ca.student_id JOIN courses c ON c.course_id = ca.course_id`;
const recRow = (x) => ({ id: String(x.record_id), date: dateLong(x.started_at), roll: x.code, name: x.name, course: x.course_name, status: x.status });
mount('records', {
  list: async () => (await many(`${REC_SQL} ORDER BY ca.started_at DESC, u.code LIMIT 2000`)).map(recRow),
  create: async () => { throw fail(405, 'Attendance records are created by sessions. Use the faculty tools.'); },
  update: async (id, b) => {
    if (!['Present', 'Absent', 'Late'].includes(b.status)) throw fail(400, 'Status must be Present, Absent or Late.');
    const d = await one(`UPDATE attendance_records SET status = $1, method = 'manual', marked_at = now() WHERE record_id = $2 RETURNING student_id, session_id`, [b.status, toInt(id, -1)]);
    if (!d) throw fail(404, 'Record not found.');
    const u = await one('SELECT code FROM users WHERE user_id = $1', [d.student_id]);
    audit('attendance_override', 'admin', `record #${id}`); emitStaff('attendance:update', { sessionId: String(d.session_id) }); if (u) emitUser(u.code, 'attendance:changed', {});
    const row = await one(`${REC_SQL} WHERE ca.record_id = $1`, [toInt(id, -1)]);
    return row ? recRow(row) : { id: String(id), status: b.status };
  },
  remove: async () => { throw fail(405, 'Attendance records cannot be deleted. Mark the student Absent instead.'); },
});

// ---------------- Enrollments (admin, or the faculty member assigned to the course)
async function courseFor(ref, user) {
  const c = await one(`SELECT * FROM courses WHERE course_code = $1 OR course_id::text = $1 ORDER BY (course_code = $1) DESC LIMIT 1`, [String(ref)]);
  if (!c) throw fail(404, 'Course not found.');
  if (user.role === 'faculty' && c.assigned_faculty_id !== user.uid) throw fail(403, 'You can only manage enrollments for your own courses.');
  return c;
}
r.get('/enrollments/my', auth('student'), wrap(async (req, res) => {
  res.json({ enrollments: (await many(`${COURSE_SQL} WHERE c.course_id IN (SELECT course_id FROM enrollments WHERE student_id = $1) ORDER BY c.course_code`, [req.user.uid])).map(courseRow) });
}));
r.get('/enrollments/course/:courseId', auth('admin', 'faculty'), wrap(async (req, res) => {
  const c = await courseFor(req.params.courseId, req.user);
  const enrolled = await many(`SELECT u.code AS id, u.name FROM enrollments e JOIN users u ON u.user_id = e.student_id WHERE e.course_id = $1 ORDER BY u.code`, [c.course_id]);
  const available = await many(`SELECT u.code AS id, u.name FROM users u WHERE u.role = 'student' AND u.status = 'Active' AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = u.user_id AND e.course_id = $1) ORDER BY u.code`, [c.course_id]);
  res.json({ course: { id: c.course_code, name: c.course_name }, enrolled, available });
}));
r.post('/enrollments', auth('admin', 'faculty'), wrap(async (req, res) => {
  const c = await courseFor(req.body.courseId, req.user);
  const s = await one(`SELECT user_id, code FROM users WHERE code = $1 AND role = 'student'`, [str(req.body.studentId)]);
  if (!s) throw fail(400, 'The selected user is not a student.');
  await tx(async (cl) => {
    await cl.query('INSERT INTO enrollments (student_id, course_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [s.user_id, c.course_id]);
    // If a class is live right now, the new student joins it as Absent so they can scan in.
    await cl.query(`INSERT INTO attendance_records (session_id, student_id, status, method) SELECT session_id, $1::int, 'Absent', 'auto' FROM attendance_sessions WHERE course_id = $2 AND ended_at IS NULL ON CONFLICT DO NOTHING`, [s.user_id, c.course_id]);
  });
  audit('enrollment_add', req.user.id, `${s.code} → ${c.course_code}`); emitAll('session:changed');
  res.status(201).json({ ok: true });
}));
r.delete('/enrollments/course/:courseId/:studentId', auth('admin', 'faculty'), wrap(async (req, res) => {
  const c = await courseFor(req.params.courseId, req.user);
  const s = await one(`SELECT user_id, code FROM users WHERE code = $1`, [req.params.studentId]); if (!s) throw fail(404, 'Student not found.');
  await tx(async (cl) => {
    await cl.query('DELETE FROM enrollments WHERE student_id = $1 AND course_id = $2', [s.user_id, c.course_id]);
    await cl.query(`DELETE FROM attendance_records WHERE student_id = $1 AND session_id IN (SELECT session_id FROM attendance_sessions WHERE course_id = $2 AND ended_at IS NULL)`, [s.user_id, c.course_id]);
  });
  audit('enrollment_remove', req.user.id, `${s.code} ✕ ${c.course_code}`); emitAll('session:changed');
  res.json({ ok: true });
}));

export default r;
