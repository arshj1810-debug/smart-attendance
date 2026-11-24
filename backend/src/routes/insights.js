import { Router } from 'express';
import { one, many } from '../db.js';
import { wrap, fail, auth, pct1, toInt, DEPT_DEFAULT } from '../lib/util.js';
import { getSetting } from '../lib/settings.js';
import { studentAnalytics, courseStudents, perStudentOverall } from '../lib/analytics.js';

const r = Router();
const ATT = `COUNT(*) FILTER (WHERE ca.status IN ('Present','Late'))::int`;
const dayLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
const monthLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short' });

const courseShape = (c) => ({ id: c.course_code, courseId: c.course_id, code: c.course_code, name: c.course_name, department: c.department, semester: c.semester, faculty: c.faculty_name || '', students: c.students });
const COURSE_SQL = `SELECT c.*, f.name AS faculty_name, (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.course_id)::int AS students
  FROM courses c LEFT JOIN users f ON f.user_id = c.assigned_faculty_id`;

// Courses visible to the caller: enrolled (student), assigned (faculty) or all (admin).
r.get('/courses', auth(), wrap(async (req, res) => {
  const u = req.user;
  const rows = u.role === 'admin' ? await many(`${COURSE_SQL} ORDER BY c.course_code`)
    : u.role === 'faculty' ? await many(`${COURSE_SQL} WHERE c.assigned_faculty_id = $1 ORDER BY c.course_code`, [u.uid])
      : await many(`${COURSE_SQL} WHERE c.course_id IN (SELECT course_id FROM enrollments WHERE student_id = $1) ORDER BY c.course_code`, [u.uid]);
  res.json({ courses: rows.map(courseShape) });
}));

r.get('/analytics/my', auth('student'), wrap(async (req, res) => res.json(await studentAnalytics(req.user.uid))));
r.get('/analytics/student/:id', auth(), wrap(async (req, res) => {
  const u = req.user;
  const t = await one(`SELECT user_id, code, name FROM users WHERE role = 'student' AND (code = $1 OR user_id::text = $1) ORDER BY (code = $1) DESC LIMIT 1`, [req.params.id]);
  if (!t) throw fail(404, 'Student not found.');
  if (u.role === 'student' && t.user_id !== u.uid) throw fail(403, 'You can only view your own attendance analytics.');
  if (u.role === 'faculty' && !(await one(`SELECT 1 FROM enrollments e JOIN courses c ON c.course_id = e.course_id WHERE e.student_id = $1 AND c.assigned_faculty_id = $2`, [t.user_id, u.uid]))) throw fail(403, 'This student is not enrolled in any of your courses.');
  res.json({ student: { id: t.code, name: t.name }, ...(await studentAnalytics(t.user_id)) });
}));

// Faculty/Admin: student-wise report for one course (numeric course_id or course code).
r.get('/attendance/course/:courseId/report', auth('faculty', 'admin'), wrap(async (req, res) => {
  const c = await one(`${COURSE_SQL} WHERE c.course_id::text = $1 OR c.course_code = $1 ORDER BY (c.course_code = $1) DESC LIMIT 1`, [req.params.courseId]);
  if (!c) throw fail(404, 'Course not found.');
  if (req.user.role === 'faculty' && c.assigned_faculty_id !== req.user.uid) throw fail(403, 'You can only view reports for courses assigned to you.');
  const students = await courseStudents(c.course_id), { threshold } = await getSetting('system');
  const sessions = (await one(`SELECT COUNT(*)::int AS n FROM attendance_sessions WHERE course_id = $1 AND ended_at IS NOT NULL`, [c.course_id])).n;
  const att = students.reduce((a, s) => a + s.attended, 0), tot = students.reduce((a, s) => a + s.total, 0);
  res.json({ course: courseShape(c), threshold, sessions_held: sessions, average: pct1(att, tot), students });
}));

// ---------- Faculty dashboard data
const todayName = () => new Date().toLocaleDateString('en-US', { weekday: 'long' });
async function schedule(uid) {
  const slots = await many(
    `SELECT c.course_code AS code, c.course_name AS name, t.time_slot AS time, t.room, (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.course_id)::int AS students
       FROM timetable_slots t JOIN courses c ON c.course_id = t.course_id WHERE c.assigned_faculty_id = $1 AND t.day = $2 ORDER BY t.time_slot`, [uid, todayName()]);
  const unscheduled = !slots.length;
  const list = unscheduled ? await many(`SELECT c.course_code AS code, c.course_name AS name, 'Any time' AS time, '' AS room, (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.course_id)::int AS students FROM courses c WHERE c.assigned_faculty_id = $1 ORDER BY c.course_code`, [uid]) : slots;
  const active = await one(`SELECT c.course_code FROM attendance_sessions s JOIN courses c ON c.course_id = s.course_id WHERE s.faculty_id = $1 AND s.ended_at IS NULL`, [uid]);
  const done = (await many(`SELECT DISTINCT c.course_code FROM attendance_sessions s JOIN courses c ON c.course_id = s.course_id WHERE s.faculty_id = $1 AND s.ended_at IS NOT NULL AND s.started_at::date = CURRENT_DATE`, [uid])).map((x) => x.course_code);
  return { unscheduled, rows: list.map((x) => ({ ...x, state: active?.course_code === x.code ? 'Active' : done.includes(x.code) ? 'Completed' : 'Upcoming' })) };
}
r.get('/faculty/schedule', auth('faculty'), wrap(async (req, res) => res.json(await schedule(req.user.uid))));

async function dailyTrend(scope, params) {
  const rows = await many(`SELECT ca.session_date::text AS d, COUNT(*)::int AS total, ${ATT} AS att FROM counted_attendance ca JOIN courses c ON c.course_id = ca.course_id
    WHERE ca.session_date >= CURRENT_DATE - 21 ${scope} GROUP BY ca.session_date ORDER BY ca.session_date DESC LIMIT 6`, params);
  return rows.reverse().map((x) => ({ d: dayLabel(x.d), pct: pct1(x.att, x.total) }));
}

r.get('/faculty/overview', auth('faculty'), wrap(async (req, res) => {
  const uid = req.user.uid, { threshold } = await getSetting('system');
  const sched = await schedule(uid);
  const byCourse = await many(`SELECT c.course_name AS name, COUNT(ca.status)::int AS total, ${ATT} AS att FROM courses c LEFT JOIN counted_attendance ca ON ca.course_id = c.course_id WHERE c.assigned_faculty_id = $1 GROUP BY c.course_id ORDER BY c.course_name`, [uid]);
  const pairs = await many(`SELECT u.code, u.name, c.course_name AS course, COUNT(ca.status)::int AS total, ${ATT} AS att
    FROM courses c JOIN enrollments e ON e.course_id = c.course_id JOIN users u ON u.user_id = e.student_id LEFT JOIN counted_attendance ca ON ca.student_id = u.user_id AND ca.course_id = c.course_id
    WHERE c.assigned_faculty_id = $1 GROUP BY u.user_id, c.course_id`, [uid]);
  const low = pairs.filter((p) => p.total && pct1(p.att, p.total) < threshold).map((p) => ({ id: p.code, name: p.name, course: p.course, percentage: pct1(p.att, p.total) })).sort((a, b) => a.percentage - b.percentage);
  const recent = await many(`SELECT c.course_name AS name, s.started_at, (SELECT COUNT(*) FILTER (WHERE status <> 'Absent') FROM attendance_records WHERE session_id = s.session_id)::int AS present, (SELECT COUNT(*) FROM attendance_records WHERE session_id = s.session_id)::int AS total
    FROM attendance_sessions s JOIN courses c ON c.course_id = s.course_id WHERE s.faculty_id = $1 AND s.ended_at IS NOT NULL ORDER BY s.ended_at DESC LIMIT 5`, [uid]);
  const students = (await one(`SELECT COUNT(DISTINCT e.student_id)::int AS n FROM enrollments e JOIN courses c ON c.course_id = e.course_id WHERE c.assigned_faculty_id = $1`, [uid])).n;
  const att = byCourse.reduce((a, x) => a + x.att, 0), tot = byCourse.reduce((a, x) => a + x.total, 0);
  res.json({
    threshold, schedule: sched,
    metrics: { courses: byCourse.length, students, classesToday: sched.unscheduled ? 0 : sched.rows.length, average: tot ? pct1(att, tot) : null },
    trend: await dailyTrend('AND c.assigned_faculty_id = $1', [uid]),
    byCourse: byCourse.map((x) => [x.name, pct1(x.att, x.total)]),
    low, recent: recent.map((x) => ({ name: x.name, date: new Date(x.started_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), present: x.present, total: x.total })),
  });
}));

r.get('/faculty/courses', auth('faculty'), wrap(async (req, res) => {
  const rows = await many(`SELECT c.course_id, c.course_code AS code, c.course_name AS name, (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.course_id)::int AS enrolled, COUNT(ca.status)::int AS total, ${ATT} AS att
    FROM courses c LEFT JOIN counted_attendance ca ON ca.course_id = c.course_id WHERE c.assigned_faculty_id = $1 GROUP BY c.course_id ORDER BY c.course_code`, [req.user.uid]);
  res.json({ courses: rows.map((x) => ({ id: x.code, courseId: x.course_id, code: x.code, name: x.name, enrolled: x.enrolled, average: x.total ? pct1(x.att, x.total) : 0 })) });
}));

// ---------- Admin dashboard
const ACTIVITY = { session_start: 'Attendance session started', session_end: 'Attendance session completed', attendance_override: 'Attendance records updated', student_create: 'New student added', student_update: 'Student updated', student_delete: 'Student removed', faculty_create: 'New faculty added', faculty_update: 'Faculty updated', faculty_delete: 'Faculty removed', course_create: 'Course created', course_update: 'Course updated', course_delete: 'Course removed', announcement: 'Announcement sent', quiz_create: 'Quiz published', config_update: 'Verification settings changed', settings_update: 'System settings changed', enrollment_add: 'Student enrolled', enrollment_remove: 'Enrollment removed' };
r.get('/admin/overview', auth('admin'), wrap(async (_req, res) => {
  const { threshold } = await getSetting('system');
  const counts = await one(`SELECT (SELECT COUNT(*) FROM users WHERE role='student' AND status='Active')::int AS students, (SELECT COUNT(*) FROM users WHERE role='faculty' AND status='Active')::int AS faculty, (SELECT COUNT(*) FROM courses)::int AS courses`);
  const today = await one(`SELECT COUNT(*)::int AS total, ${ATT} AS att FROM counted_attendance ca WHERE ca.session_date = CURRENT_DATE`);
  const week = await one(`SELECT COUNT(*)::int AS total, ${ATT} AS att FROM counted_attendance ca WHERE ca.session_date >= CURRENT_DATE - 7`);
  const dept = await many(`SELECT c.department AS name, COUNT(*)::int AS total, ${ATT} AS att FROM counted_attendance ca JOIN courses c ON c.course_id = ca.course_id GROUP BY c.department ORDER BY c.department`);
  const students = await perStudentOverall();
  const low = students.filter((s) => s.total && pct1(s.attended, s.total) < threshold).map((s) => ({ id: s.code, name: s.name, course: s.program || s.department, percentage: pct1(s.attended, s.total), attended: s.attended, total: s.total })).sort((a, b) => a.percentage - b.percentage);
  const log = await many(`SELECT type, detail, at FROM audit_logs WHERE type = ANY($1::text[]) ORDER BY at DESC LIMIT 8`, [Object.keys(ACTIVITY)]);
  res.json({
    threshold, counts,
    todayPct: today.total ? pct1(today.att, today.total) : null, weekPct: week.total ? pct1(week.att, week.total) : null,
    trend: await dailyTrend('', []), byDepartment: dept.map((d) => [d.name || 'Unassigned', pct1(d.att, d.total)]), low,
    activity: log.map((l) => `${ACTIVITY[l.type]}${l.detail ? ` — ${l.detail}` : ''}`),
  });
}));

// ---------- Analytics page (admin: everything; faculty: own courses)
r.get('/analytics/overview', auth('admin', 'faculty'), wrap(async (req, res) => {
  const q = req.query, params = [], and = [];
  const add = (sql, v) => { params.push(v); and.push(sql.replace('?', `$${params.length}`)); };
  if (req.user.role === 'faculty') add('c.assigned_faculty_id = ?', req.user.uid);
  if (q.dept) add('c.department = ?', String(q.dept));
  if (q.course) add('c.course_name = ?', String(q.course));
  if (q.sem) add('c.semester = ?', toInt(q.sem, -1));
  if (q.faculty && req.user.role === 'admin') add('c.assigned_faculty_id IN (SELECT user_id FROM users WHERE name = ?)', String(q.faculty));
  const scope = and.length ? ` AND ${and.join(' AND ')}` : '';
  const months = Math.min(12, Math.max(1, toInt(q.range, 6)));
  const { threshold } = await getSetting('system');
  const from = `ca.session_date >= (date_trunc('month', CURRENT_DATE) - interval '${months - 1} months')::date`;
  const tot = await one(`SELECT COUNT(*)::int AS total, ${ATT} AS att FROM counted_attendance ca JOIN courses c ON c.course_id = ca.course_id WHERE ${from} ${scope}`, params);
  const perStudent = await many(`SELECT ca.student_id, COUNT(*)::int AS total, ${ATT} AS att FROM counted_attendance ca JOIN courses c ON c.course_id = ca.course_id WHERE ${from} ${scope} GROUP BY ca.student_id`, params);
  const inView = (await one(`SELECT COUNT(DISTINCT e.student_id)::int AS n FROM enrollments e JOIN courses c ON c.course_id = e.course_id JOIN users u ON u.user_id = e.student_id AND u.status = 'Active' WHERE TRUE ${scope}`, params)).n;
  const monthly = await many(`SELECT date_trunc('month', ca.session_date)::date::text AS d, COUNT(*)::int AS total, ${ATT} AS att FROM counted_attendance ca JOIN courses c ON c.course_id = ca.course_id WHERE ${from} ${scope} GROUP BY 1 ORDER BY 1`, params);
  const byCourse = await many(`SELECT c.course_name AS name, COUNT(*)::int AS total, ${ATT} AS att FROM counted_attendance ca JOIN courses c ON c.course_id = ca.course_id WHERE ${from} ${scope} GROUP BY c.course_name ORDER BY c.course_name`, params);
  const byDept = await many(`SELECT c.department AS name, COUNT(*)::int AS total, ${ATT} AS att FROM counted_attendance ca JOIN courses c ON c.course_id = ca.course_id WHERE ${from} ${scope} GROUP BY c.department ORDER BY c.department`, params);
  res.json({
    threshold, avg: pct1(tot.att, tot.total), students: inView, below: perStudent.filter((s) => pct1(s.att, s.total) < threshold).length, attended: tot.att, total: tot.total,
    weekly: await dailyTrend(scope, params), monthly: monthly.map((m) => ({ d: monthLabel(m.d), pct: pct1(m.att, m.total) })),
    byCourse: byCourse.map((x) => [x.name, pct1(x.att, x.total)]), byDept: byDept.map((x) => [x.name || 'Unassigned', pct1(x.att, x.total)]),
  });
}));

// ---------- Generated reports (admin)
r.get('/reports', auth('admin'), wrap(async (req, res) => {
  const type = String(req.query.type || 'Student-wise'), dept = String(req.query.dept || ''), { threshold } = await getSetting('system');
  if (type === 'Student-wise' || type === 'Low attendance') {
    const list = await perStudentOverall(dept ? { where: 'AND u.department = $1', params: [dept] } : {});
    if (type === 'Student-wise') return res.json({ keys: ['Roll number', 'Name', 'Department', 'Course', 'Attended', 'Total', 'Attendance %'], rows: list.map((s) => ({ 'Roll number': s.code, Name: s.name, Department: s.department, Course: s.program, Attended: s.attended, Total: s.total, 'Attendance %': pct1(s.attended, s.total) })) });
    return res.json({ keys: ['Roll number', 'Name', 'Course', 'Attendance %', 'Status'], rows: list.filter((s) => s.total && pct1(s.attended, s.total) < threshold).map((s) => ({ 'Roll number': s.code, Name: s.name, Course: s.program, 'Attendance %': pct1(s.attended, s.total), Status: pct1(s.attended, s.total) < threshold - 10 ? 'Critical' : 'Warning' })) });
  }
  if (type === 'Course-wise') {
    const rows = await many(`SELECT c.course_code, c.course_name, (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.course_id)::int AS students, COUNT(ca.status)::int AS total, ${ATT} AS att
      FROM courses c LEFT JOIN counted_attendance ca ON ca.course_id = c.course_id WHERE ($1::text = '' OR c.department = $1::text) GROUP BY c.course_id ORDER BY c.course_name`, [dept]);
    return res.json({ keys: ['Course', 'Students', 'Attended', 'Total', 'Attendance %'], rows: rows.map((x) => ({ Course: `${x.course_code} · ${x.course_name}`, Students: x.students, Attended: x.att, Total: x.total, 'Attendance %': pct1(x.att, x.total) })) });
  }
  if (type === 'Department-wise') {
    const rows = await many(`SELECT c.department AS name, COUNT(ca.status)::int AS total, ${ATT} AS att, (SELECT COUNT(DISTINCT e.student_id) FROM enrollments e JOIN courses c2 ON c2.course_id = e.course_id WHERE c2.department = c.department)::int AS students
      FROM courses c LEFT JOIN counted_attendance ca ON ca.course_id = c.course_id WHERE ($1::text = '' OR c.department = $1::text) GROUP BY c.department ORDER BY c.department`, [dept]);
    return res.json({ keys: ['Department', 'Students', 'Attended', 'Total', 'Attendance %'], rows: rows.map((x) => ({ Department: x.name, Students: x.students, Attended: x.att, Total: x.total, 'Attendance %': pct1(x.att, x.total) })) });
  }
  throw fail(400, 'Unknown report type.');
}));

// Dropdown data for forms and filters.
r.get('/meta', auth(), wrap(async (_req, res) => {
  const deps = await many(`SELECT d FROM (SELECT department AS d FROM users UNION SELECT department FROM courses) x WHERE d <> '' ORDER BY d`);
  const departments = [...new Set([...DEPT_DEFAULT, ...deps.map((x) => x.d)])].sort();
  const courses = await many(`${COURSE_SQL} ORDER BY c.course_code`);
  const faculty = await many(`SELECT code, name, department FROM users WHERE role = 'faculty' AND status = 'Active' ORDER BY name`);
  const programs = (await many(`SELECT DISTINCT program FROM users WHERE program <> '' ORDER BY program`)).map((x) => x.program);
  const semesters = [...new Set([...courses.map((c) => c.semester), 1, 2, 3, 4, 5, 6, 7, 8])].sort((a, b) => a - b);
  res.json({ departments, courses: courses.map(courseShape), faculty, programs, semesters });
}));

export default r;
