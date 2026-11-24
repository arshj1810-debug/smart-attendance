import { many, one, query } from '../db.js';
import { getSetting } from './settings.js';
import { classesNeeded, pct1 } from './util.js';
import { emitUser, emitRole } from './realtime.js';

export async function notifyUser(userId, code, { title, body, type = 'Update' }) {
  const n = await one(`INSERT INTO notifications (title, body, audience, target_user_id, type) VALUES ($1, $2, 'student', $3, $4) RETURNING notification_id`, [title, body, userId, type]);
  emitUser(code, 'notification:new', { id: n.notification_id });
  return n;
}

// After a session ends: warn every student of that course whose attendance is below the threshold.
// One warning per student per course per day, so repeated sessions do not spam the inbox.
export async function lowAttendanceAlerts(courseId) {
  const { threshold } = await getSetting('system');
  const course = await one('SELECT course_name FROM courses WHERE course_id = $1', [courseId]);
  if (!course) return 0;
  const rows = await many(
    `SELECT u.user_id, u.code,
            COUNT(x.status)::int AS total,
            COUNT(*) FILTER (WHERE x.status IN ('Present','Late'))::int AS attended
       FROM enrollments e JOIN users u ON u.user_id = e.student_id AND u.status = 'Active'
       LEFT JOIN counted_attendance x ON x.student_id = e.student_id AND x.course_id = e.course_id
      WHERE e.course_id = $1 GROUP BY u.user_id`, [courseId]);
  let sent = 0;
  for (const r of rows) {
    if (!r.total || pct1(r.attended, r.total) >= threshold) continue;
    const title = `Low attendance warning: ${course.course_name}`;
    const dup = await one(`SELECT 1 FROM notifications WHERE target_user_id = $1 AND title = $2 AND created_at > now() - interval '1 day'`, [r.user_id, title]);
    if (dup) continue;
    const need = classesNeeded(r.attended, r.total, threshold);
    await notifyUser(r.user_id, r.code, { title, body: `Your attendance in ${course.course_name} is ${pct1(r.attended, r.total)}%. Attend the next ${need} class${need === 1 ? '' : 'es'} in a row to reach ${threshold}%.`, type: 'Alert' });
    sent++;
  }
  if (sent) emitRole('admin', 'notification:new', {});
  return sent;
}
