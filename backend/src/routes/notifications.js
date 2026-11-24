import { Router } from 'express';
import { one, many, query } from '../db.js';
import { wrap, fail, auth, audit, str, toInt } from '../lib/util.js';
import { emitAll, emitRole } from '../lib/realtime.js';

const r = Router();
const VISIBLE = `(n.target_user_id = $1 OR (n.target_user_id IS NULL AND ($2::text = 'admin' OR n.audience = 'all' OR n.audience = $2::text)))`;
const rel = (d) => {
  const dt = new Date(d), now = new Date(), y = new Date(now.getTime() - 864e5);
  return dt.toDateString() === now.toDateString() ? 'Today' : dt.toDateString() === y.toDateString() ? 'Yesterday' : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
const shape = (n) => ({ id: String(n.notification_id), title: n.title, body: n.body, audience: n.target_user_id ? 'student' : n.audience, type: n.type, date: rel(n.created_at), createdAt: n.created_at, read: n.is_read });

r.get('/notifications', auth(), wrap(async (req, res) => {
  const rows = await many(`SELECT n.*, EXISTS (SELECT 1 FROM notification_reads x WHERE x.notification_id = n.notification_id AND x.user_id = $1) AS is_read
    FROM notifications n WHERE ${VISIBLE} ORDER BY n.created_at DESC, n.notification_id DESC LIMIT 200`, [req.user.uid, req.user.role]);
  res.json({ notifications: rows.map(shape), unread: rows.filter((n) => !n.is_read).length });
}));

r.post('/notifications', auth('admin'), wrap(async (req, res) => {
  const title = str(req.body.title), body = str(req.body.body), audience = ['all', 'faculty', 'student'].includes(req.body.audience) ? req.body.audience : 'all';
  const type = req.body.type === 'Alert' ? 'Alert' : 'Announcement';
  if (!title || !body) throw fail(400, 'Add a title and a message.');
  const n = await one('INSERT INTO notifications (title, body, audience, type, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *', [title, body, audience, type, req.user.uid]);
  await query('INSERT INTO notification_reads (notification_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [n.notification_id, req.user.uid]);
  audit('announcement', req.user.id, `${title} → ${audience}`);
  if (audience === 'all') emitAll('notification:new', {}); else { emitRole(audience, 'notification:new', {}); emitRole('admin', 'notification:new', {}); }
  res.status(201).json(shape({ ...n, is_read: true }));
}));

r.post('/notifications/read-all', auth(), wrap(async (req, res) => {
  await query(`INSERT INTO notification_reads (notification_id, user_id) SELECT n.notification_id, $1::int FROM notifications n WHERE ${VISIBLE} ON CONFLICT DO NOTHING`, [req.user.uid, req.user.role]);
  res.json({ ok: true });
}));
r.post('/notifications/:id/read', auth(), wrap(async (req, res) => {
  const id = toInt(req.params.id, -1);
  await query(`INSERT INTO notification_reads (notification_id, user_id) SELECT n.notification_id, $1::int FROM notifications n WHERE n.notification_id = $3 AND ${VISIBLE} ON CONFLICT DO NOTHING`, [req.user.uid, req.user.role, id]);
  res.json({ ok: true });
}));
r.delete('/notifications/:id', auth('admin'), wrap(async (req, res) => {
  await query('DELETE FROM notifications WHERE notification_id = $1', [toInt(req.params.id, -1)]);
  res.json({ ok: true });
}));

r.get('/audit', auth('admin'), wrap(async (_req, res) => res.json({ events: await many('SELECT at, type, actor, detail FROM audit_logs ORDER BY at DESC LIMIT 200') })));

export default r;
