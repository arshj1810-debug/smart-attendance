import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { one, query, many } from '../db.js';
import { wrap, fail, auth, audit, pubUser, signAccess, signRefresh, verifyToken, str, isEmail } from '../lib/util.js';
import { getSetting, setSetting } from '../lib/settings.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many failed attempts. Try again in a few minutes.' } });
const tokens = (u) => ({ user: pubUser(u), accessToken: signAccess(u), refreshToken: signRefresh(u) });

r.post('/login', limiter, wrap(async (req, res) => {
  const email = str(req.body.email).toLowerCase(), password = String(req.body.password || '');
  const u = await one('SELECT * FROM users WHERE lower(email) = $1', [email]);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) throw fail(401, 'Email or password is incorrect.');
  if (u.status !== 'Active') throw fail(403, 'This account is inactive. Contact your administrator.');
  audit('login', u.code, u.role);
  res.json(tokens(u));
}));

// One-click demo sign-in used by the login screen. Only works while demo data is enabled (SEED_DEMO=true).
r.post('/demo', wrap(async (req, res) => {
  if (!config.seedDemo) throw fail(403, 'Demo access is disabled on this server.');
  const email = { admin: 'admin@college.edu', faculty: 'faculty@college.edu', student: 'student@college.edu' }[req.body.role];
  const u = email && await one('SELECT * FROM users WHERE lower(email) = $1 AND status = $2', [email, 'Active']);
  if (!u) throw fail(404, 'Demo account not found.');
  res.json(tokens(u));
}));

r.post('/refresh', wrap(async (req, res) => {
  let p; try { p = verifyToken(String(req.body.refreshToken || '')); if (p.type !== 'refresh') throw new Error(); } catch { throw fail(401, 'Please sign in again.'); }
  const u = await one('SELECT * FROM users WHERE user_id = $1 AND status = $2', [p.uid, 'Active']);
  if (!u) throw fail(401, 'Please sign in again.');
  res.json({ accessToken: signAccess(u), user: pubUser(u) });
}));

// Public sign-up is OFF by default. When enabled it can only ever create a Student, never Admin or Faculty.
r.post('/register', limiter, wrap(async (req, res) => {
  if (!config.selfRegistration) throw fail(403, 'Self-registration is disabled. Ask your administrator for an account.');
  const b = req.body, code = str(b.id || b.rollNumber), name = str(b.name), email = str(b.email).toLowerCase(), password = String(b.password || '');
  if (!code || !name || !isEmail(email) || password.length < 8) throw fail(400, 'Roll number, name, a valid email and a password of 8+ characters are required.');
  const u = await one(`INSERT INTO users (code, name, email, password_hash, role, department, program, semester) VALUES ($1,$2,$3,$4,'student',$5,$6,$7) RETURNING *`,
    [code, name, email, bcrypt.hashSync(password, 10), str(b.department), str(b.course), Number.isInteger(+b.semester) ? +b.semester : null]);
  audit('register', code, 'student');
  res.status(201).json(tokens(u));
}));

r.get('/me', auth(), wrap(async (req, res) => {
  res.json({ user: pubUser(await one('SELECT * FROM users WHERE user_id = $1', [req.user.uid])) });
}));

r.put('/profile', auth(), wrap(async (req, res) => {
  const name = str(req.body.name), email = str(req.body.email).toLowerCase();
  if (!name || !isEmail(email)) throw fail(400, 'Enter your name and a valid email address.');
  const u = await one('UPDATE users SET name = $1, email = $2 WHERE user_id = $3 RETURNING *', [name, email, req.user.uid]);
  audit('profile_update', req.user.id, '');
  res.json({ user: pubUser(u) });
}));

r.post('/change-password', auth(), limiter, wrap(async (req, res) => {
  const { current = '', next = '' } = req.body;
  if (String(next).length < 8) throw fail(400, 'New password must be at least 8 characters.');
  const u = await one('SELECT password_hash FROM users WHERE user_id = $1', [req.user.uid]);
  if (!bcrypt.compareSync(String(current), u.password_hash)) throw fail(400, 'Current password is incorrect.');
  await query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [bcrypt.hashSync(String(next), 10), req.user.uid]);
  audit('password_change', req.user.id, '');
  res.json({ ok: true });
}));

export default r;
