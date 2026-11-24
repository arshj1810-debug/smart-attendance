import { many, one } from '../db.js';
import { pct1, classesNeeded } from './util.js';
import { getSetting } from './settings.js';

// Per-course attendance for one student (courses with no recorded sessions yet appear with zero totals).
export async function studentSubjects(studentId) {
  const { threshold } = await getSetting('system');
  const rows = await many(
    `SELECT c.course_id, c.course_code AS code, c.course_name AS name,
            COUNT(x.status)::int AS total,
            COUNT(*) FILTER (WHERE x.status IN ('Present','Late'))::int AS attended,
            COUNT(*) FILTER (WHERE x.status = 'Present')::int AS present,
            COUNT(*) FILTER (WHERE x.status = 'Absent')::int AS absent,
            COUNT(*) FILTER (WHERE x.status = 'Late')::int AS late
       FROM enrollments e
       JOIN courses c ON c.course_id = e.course_id
       LEFT JOIN counted_attendance x ON x.student_id = e.student_id AND x.course_id = e.course_id
      WHERE e.student_id = $1
      GROUP BY c.course_id ORDER BY c.course_name`, [studentId]);
  return rows.map((r) => {
    const percentage = pct1(r.attended, r.total);
    return { courseId: r.course_id, code: r.code, name: r.name, recorded_sessions: r.total, total: r.total, attended: r.attended, present_count: r.present, absent_count: r.absent, late_count: r.late, percentage, attendance_percentage: percentage, low_attendance: r.total > 0 && percentage < threshold, needed: r.total ? classesNeeded(r.attended, r.total, threshold) : 0 };
  });
}

export async function studentAnalytics(studentId) {
  const { threshold } = await getSetting('system');
  const subjects = await studentSubjects(studentId);
  const attended = subjects.reduce((a, s) => a + s.attended, 0), total = subjects.reduce((a, s) => a + s.total, 0);
  const percentage = pct1(attended, total);
  return {
    threshold,
    overall: { recorded_sessions: total, total, attended, missed: total - attended, percentage, attendance_percentage: percentage, low_attendance: total > 0 && percentage < threshold, courses_below_threshold: subjects.filter((s) => s.low_attendance).length },
    subjects, courses: subjects,
  };
}

// Student-wise report for a set of course ids (or all courses when null).
export async function courseStudents(courseId) {
  const { threshold } = await getSetting('system');
  const rows = await many(
    `SELECT u.user_id, u.code, u.name, u.department, u.program,
            COUNT(x.status)::int AS total,
            COUNT(*) FILTER (WHERE x.status IN ('Present','Late'))::int AS attended,
            COUNT(*) FILTER (WHERE x.status = 'Present')::int AS present,
            COUNT(*) FILTER (WHERE x.status = 'Absent')::int AS absent,
            COUNT(*) FILTER (WHERE x.status = 'Late')::int AS late
       FROM enrollments e
       JOIN users u ON u.user_id = e.student_id
       LEFT JOIN counted_attendance x ON x.student_id = e.student_id AND x.course_id = e.course_id
      WHERE e.course_id = $1
      GROUP BY u.user_id ORDER BY u.code`, [courseId]);
  return rows.map((r) => {
    const percentage = pct1(r.attended, r.total);
    return { id: r.code, student_id: r.code, name: r.name, department: r.department, recorded_sessions: r.total, total: r.total, attended: r.attended, present_count: r.present, absent_count: r.absent, late_count: r.late, percentage, attendance_percentage: percentage, low_attendance: r.total > 0 && percentage < threshold };
  });
}

// Overall (all-course) percentage per student, optionally limited by extra SQL conditions on courses.
export async function perStudentOverall({ where = '', params = [] } = {}) {
  return many(
    `SELECT u.user_id, u.code, u.name, u.department, u.program,
            COUNT(ca.status)::int AS total,
            COUNT(*) FILTER (WHERE ca.status IN ('Present','Late'))::int AS attended
       FROM users u
       LEFT JOIN counted_attendance ca ON ca.student_id = u.user_id
       LEFT JOIN courses c ON c.course_id = ca.course_id
      WHERE u.role = 'student' AND u.status = 'Active' ${where}
      GROUP BY u.user_id ORDER BY u.code`, params);
}

export const courseOwnedBy = (courseId, facultyUid) => one('SELECT course_id FROM courses WHERE course_id = $1 AND assigned_faculty_id = $2', [courseId, facultyUid]);
