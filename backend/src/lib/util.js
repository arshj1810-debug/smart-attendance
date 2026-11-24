import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one, query } from '../db.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => new HttpError(status, message);
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const signAccess = (u) => jwt.sign({ uid: u.user_id, id: u.code, name: u.name, role: u.role }, config.jwtSecret, { expiresIn: '2h' });
export const signRefresh = (u) => jwt.sign({ uid: u.user_id, type: 'refresh' }, config.jwtSecret, { expiresIn: '7d' });
export const verifyToken = (t) => jwt.verify(t, config.jwtSecret);

const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

// Authenticates the JWT, re-checks the account is still active, then enforces the allowed roles.
export const auth = (...roles) => wrap(async (req, _res, next) => {
  let p;
  try { p = verifyToken(bearer(req)); } catch { throw fail(401, 'Please sign in again.'); }
  if (p.type === 'refresh') throw fail(401, 'Please sign in again.');
  const u = await one('SELECT user_id, code, name, role, status FROM users WHERE user_id = $1', [p.uid]);
  if (!u || u.status !== 'Active') throw fail(401, 'Please sign in again.');
  req.user = { uid: u.user_id, id: u.code, name: u.name, role: u.role };
  if (roles.length && !roles.includes(req.user.role)) throw fail(403, 'You do not have access to this action.');
  next();
});

export const audit = (type, actor, detail) =>
  query('INSERT INTO audit_logs (type, actor, detail) VALUES ($1, $2, $3)', [type, actor || null, detail == null ? null : String(detail)]).catch(() => {});

export const pubUser = (u) => ({ id: u.code, name: u.name, email: u.email, role: u.role, department: u.department, ...(u.role === 'student' && { course: u.program, semester: u.semester }) });

export const pct1 = (a, t) => (t ? Math.round((a / t) * 1000) / 10 : 0);
// Number of further consecutive classes needed to reach the threshold.
export const classesNeeded = (a, t, th) => {
  if (!t || pct1(a, t) >= th) return 0;
  const r = th / 100; if (r >= 1) return 0;
  return Math.max(0, Math.ceil((r * t - a) / (1 - r) - 1e-9));
};

export const dateLabel = (d) => {
  const dt = new Date(d), now = new Date();
  return dt.toDateString() === now.toDateString() ? 'Today' : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
export const dateLong = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const str = (v) => (v == null ? '' : String(v).trim());
export const isEmail = (v) => /^\S+@\S+\.\S+$/.test(v);
export const toInt = (v, d = null) => { const n = Number(v); return Number.isInteger(n) ? n : d; };
export const DEPT_DEFAULT = ['Computer Science', 'Mathematics', 'Electronics', 'Mechanical Engineering'];

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'The request body is not valid JSON.' });
  if (err.code === '23505') return res.status(409).json({ message: 'That value already exists (duplicate ID, email or code).' });
  if (err.code === '23503') return res.status(409).json({ message: 'This item is linked to other records and cannot be changed that way.' });
  if (err.code === '23514' || err.code === '22P02' || err.code === '22003') return res.status(400).json({ message: 'One of the submitted values is not valid.' });
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ message: config.isProd ? 'Something went wrong on the server.' : `Server error: ${err.message}` });
}
