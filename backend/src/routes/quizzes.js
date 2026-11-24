import { Router } from 'express';
import { one, many, query } from '../db.js';
import { wrap, fail, auth, audit, toInt } from '../lib/util.js';

const r = Router();
const SQL = `SELECT q.*, c.course_code, c.course_name, u.name AS creator FROM quizzes q JOIN courses c ON c.course_id = q.course_id JOIN users u ON u.user_id = q.created_by`;
const dueMs = (q) => new Date(q.deadline).getTime();
const endsAt = (q, a) => Math.min(dueMs(q), new Date(a.started_at).getTime() + q.duration_min * 60000);
const own = (q, u) => u.role === 'admin' || q.created_by === u.uid;
const pubQ = (q, key) => ({ id: String(q.quiz_id), title: q.title, courseCode: q.course_code, courseName: q.course_name, durationMin: q.duration_min, deadline: new Date(q.deadline).toISOString(), createdBy: q.creator, questionCount: q.questions.length, questions: q.questions.map((x) => ({ text: x.text, options: x.options, ...(key && { correct: x.correct }) })) });
const load = async (id) => { const n = toInt(id); return n == null ? null : one(`${SQL} WHERE q.quiz_id = $1`, [n]); };
const isEnrolled = (uid, courseId) => one('SELECT 1 FROM enrollments WHERE student_id = $1 AND course_id = $2', [uid, courseId]);
const attempt = (qid, uid) => one('SELECT * FROM quiz_attempts WHERE quiz_id = $1 AND student_id = $2', [qid, uid]);
async function statsFor(ids) {
  if (!ids.length) return new Map();
  const rows = await many(`SELECT quiz_id, COUNT(*)::int AS attempts, ROUND(AVG(score::numeric / NULLIF(total, 0) * 100))::int AS average FROM quiz_attempts WHERE submitted_at IS NOT NULL AND quiz_id = ANY($1::int[]) GROUP BY quiz_id`, [ids]);
  return new Map(rows.map((x) => [x.quiz_id, x]));
}

r.post('/quizzes', auth('faculty', 'admin'), wrap(async (req, res) => {
  const b = req.body, qs = Array.isArray(b.questions) ? b.questions : [], dl = new Date(b.deadline).getTime();
  if (!String(b.title || '').trim() || !b.courseCode) throw fail(400, 'Add a title and choose a course.');
  if (!(b.durationMin >= 1 && b.durationMin <= 180)) throw fail(400, 'Duration must be between 1 and 180 minutes.');
  if (!(dl > Date.now())) throw fail(400, 'Choose a deadline in the future.');
  if (!qs.length || qs.length > 200 || qs.some((x) => !String(x.text || '').trim() || !Array.isArray(x.options) || x.options.length < 2 || x.options.some((o) => !String(o).trim()) || !Number.isInteger(x.correct) || x.correct < 0 || x.correct >= x.options.length)) throw fail(400, 'Every question needs text, filled options and a correct answer.');
  const course = await one('SELECT * FROM courses WHERE course_code = $1', [String(b.courseCode)]);
  if (!course) throw fail(400, 'Choose a valid course.');
  if (req.user.role === 'faculty' && course.assigned_faculty_id !== req.user.uid) throw fail(403, 'You can only create quizzes for your own courses.');
  const questions = qs.map((x) => ({ text: String(x.text).trim(), options: x.options.map(String), correct: x.correct }));
  const row = await one('INSERT INTO quizzes (title, course_id, created_by, duration_min, deadline, questions) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING quiz_id',
    [String(b.title).trim(), course.course_id, req.user.uid, Number(b.durationMin), new Date(dl).toISOString(), JSON.stringify(questions)]);
  audit('quiz_create', req.user.id, `${b.title} (${course.course_code})`);
  res.status(201).json(pubQ(await load(row.quiz_id), true));
}));

r.get('/quizzes', auth(), wrap(async (req, res) => {
  const u = req.user;
  if (u.role === 'student') {
    const rows = await many(`${SQL} WHERE q.course_id IN (SELECT course_id FROM enrollments WHERE student_id = $1) ORDER BY q.quiz_id DESC`, [u.uid]);
    const at = new Map((await many('SELECT * FROM quiz_attempts WHERE student_id = $1', [u.uid])).map((a) => [a.quiz_id, a]));
    return res.json({ quizzes: rows.map((q) => { const a = at.get(q.quiz_id); return { ...pubQ(q), questions: undefined, status: a?.submitted_at ? 'completed' : a ? 'in_progress' : Date.now() > dueMs(q) ? 'closed' : 'available', score: a?.submitted_at ? a.score : null, total: q.questions.length }; }) });
  }
  const rows = u.role === 'admin' ? await many(`${SQL} ORDER BY q.quiz_id DESC`) : await many(`${SQL} WHERE q.created_by = $1 ORDER BY q.quiz_id DESC`, [u.uid]);
  const st = await statsFor(rows.map((q) => q.quiz_id));
  res.json({ quizzes: rows.map((q) => ({ ...pubQ(q, true), attempts: st.get(q.quiz_id)?.attempts ?? 0, average: st.get(q.quiz_id)?.average ?? null })) });
}));

r.post('/quizzes/:id/start', auth('student'), wrap(async (req, res) => {
  const q = await load(req.params.id); if (!q || !(await isEnrolled(req.user.uid, q.course_id))) throw fail(404, 'Quiz not found.');
  let a = await attempt(q.quiz_id, req.user.uid);
  if (a?.submitted_at) throw fail(409, 'You have already submitted this quiz.');
  if (!a) {
    if (Date.now() > dueMs(q)) throw fail(403, 'This quiz is closed.');
    await query('INSERT INTO quiz_attempts (quiz_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [q.quiz_id, req.user.uid]);
    a = await attempt(q.quiz_id, req.user.uid);
  }
  res.json({ quiz: pubQ(q), endsAt: endsAt(q, a), answers: a.answers });
}));

r.post('/quizzes/:id/answers', auth('student'), wrap(async (req, res) => {
  const q = await load(req.params.id), a = q && await attempt(q.quiz_id, req.user.uid);
  if (!a || a.submitted_at || Date.now() > endsAt(q, a) + 5000) throw fail(409, 'This attempt is closed.');
  if (Array.isArray(req.body.answers)) await query('UPDATE quiz_attempts SET answers = $1::jsonb WHERE quiz_id = $2 AND student_id = $3 AND submitted_at IS NULL', [JSON.stringify(req.body.answers.slice(0, q.questions.length)), q.quiz_id, req.user.uid]);
  res.json({ ok: true });
}));

r.post('/quizzes/:id/submit', auth('student'), wrap(async (req, res) => {
  const q = await load(req.params.id), a = q && await attempt(q.quiz_id, req.user.uid);
  if (!a) throw fail(409, 'Start the quiz first.');
  if (a.submitted_at) throw fail(409, 'You have already submitted this quiz.');
  const late = Date.now() > endsAt(q, a) + 5000; // after the timer only answers saved during the attempt count
  const answers = late ? a.answers : Array.isArray(req.body.answers) ? req.body.answers : a.answers;
  const score = q.questions.reduce((n, x, i) => n + (answers[i] === x.correct ? 1 : 0), 0), total = q.questions.length;
  const done = await query('UPDATE quiz_attempts SET answers = $1::jsonb, score = $2, total = $3, submitted_at = now(), timed_out = $4 WHERE quiz_id = $5 AND student_id = $6 AND submitted_at IS NULL', [JSON.stringify(answers), score, total, late, q.quiz_id, req.user.uid]);
  if (!done.rowCount) throw fail(409, 'You have already submitted this quiz.');
  audit('quiz_submit', req.user.id, `quiz ${q.quiz_id}`);
  res.json({ score, total, percent: Math.round((score / total) * 100), timedOut: late, review: q.questions.map((x, i) => ({ text: x.text, options: x.options, correct: x.correct, chosen: answers[i] ?? null })) });
}));

r.get('/results/me', auth('student'), wrap(async (req, res) => {
  const rows = await many(`SELECT a.*, q.title, c.course_name FROM quiz_attempts a JOIN quizzes q ON q.quiz_id = a.quiz_id JOIN courses c ON c.course_id = q.course_id WHERE a.student_id = $1 AND a.submitted_at IS NOT NULL ORDER BY a.submitted_at DESC`, [req.user.uid]);
  res.json({ results: rows.map((a) => ({ quizId: String(a.quiz_id), title: a.title, courseName: a.course_name, score: a.score, total: a.total, percent: Math.round((a.score / a.total) * 100), submittedAt: new Date(a.submitted_at).getTime(), timedOut: a.timed_out })) });
}));

r.get('/quizzes/:id/results', auth('faculty', 'admin'), wrap(async (req, res) => {
  const q = await load(req.params.id); if (!q || !own(q, req.user)) throw fail(404, 'Quiz not found.');
  const rows = await many(`SELECT u.code, u.name, a.submitted_at, a.score, a.total, (a.quiz_id IS NOT NULL) AS started FROM enrollments e JOIN users u ON u.user_id = e.student_id
    LEFT JOIN quiz_attempts a ON a.student_id = u.user_id AND a.quiz_id = $1 WHERE e.course_id = $2 ORDER BY u.code`, [q.quiz_id, q.course_id]);
  const st = (await statsFor([q.quiz_id])).get(q.quiz_id);
  res.json({ quiz: { id: String(q.quiz_id), title: q.title, courseName: q.course_name }, stats: { attempts: st?.attempts ?? 0, average: st?.average ?? null },
    rows: rows.map((x) => { const done = !!x.submitted_at; return { studentId: x.code, name: x.name, status: done ? 'Submitted' : x.started ? 'In progress' : 'Not attempted', score: done ? x.score : null, total: q.questions.length, percent: done ? Math.round((x.score / q.questions.length) * 100) : null }; }) });
}));

r.delete('/quizzes/:id/attempts/:studentId', auth('faculty', 'admin'), wrap(async (req, res) => {
  const q = await load(req.params.id); if (!q || !own(q, req.user)) throw fail(404, 'Quiz not found.');
  await query('DELETE FROM quiz_attempts WHERE quiz_id = $1 AND student_id = (SELECT user_id FROM users WHERE code = $2)', [q.quiz_id, req.params.studentId]);
  audit('quiz_retake_allowed', req.user.id, `${q.quiz_id}:${req.params.studentId}`);
  res.json({ ok: true });
}));

r.delete('/quizzes/:id', auth('faculty', 'admin'), wrap(async (req, res) => {
  const q = await load(req.params.id); if (!q || !own(q, req.user)) throw fail(404, 'Quiz not found.');
  await query('DELETE FROM quizzes WHERE quiz_id = $1', [q.quiz_id]);
  audit('quiz_delete', req.user.id, String(q.quiz_id));
  res.json({ ok: true });
}));

export default r;
