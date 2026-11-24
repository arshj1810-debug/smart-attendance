import { Router } from 'express';
import { wrap, fail, auth, audit } from '../lib/util.js';
import { getSetting, setSetting } from '../lib/settings.js';
import { checkEnv } from '../lib/verify.js';

const r = Router();

// Campus verification config (read by all signed-in users, edited by admins).
r.get('/config', auth(), wrap(async (_req, res) => res.json(await getSetting('verification'))));
r.put('/config', auth('admin'), wrap(async (req, res) => {
  const { geofence: g = {}, network: n = {} } = req.body; const num = (v, lo, hi) => Number.isFinite(+v) && +v >= lo && +v <= hi;
  if (!num(g.lat, -90, 90) || !num(g.lng, -180, 180) || !num(g.radius, 20, 5000)) throw fail(400, 'Enter a valid latitude, longitude and a radius between 20 and 5000 m.');
  const ranges = (n.ranges || []).map((x) => String(x).trim()).filter(Boolean);
  if (ranges.some((x) => !/^(::1|\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?)$/.test(x))) throw fail(400, 'Network ranges must look like 192.168.0.0/16.');
  const cfg = { geofence: { enabled: !!g.enabled, lat: +g.lat, lng: +g.lng, radius: +g.radius }, network: { enabled: !!n.enabled, ranges } };
  await setSetting('verification', cfg); audit('config_update', req.user.id, 'verification');
  res.json(cfg);
}));

// System settings: threshold, late window, default session length, academic session label.
r.get('/settings', auth(), wrap(async (_req, res) => res.json(await getSetting('system'))));
r.put('/settings', auth('admin'), wrap(async (req, res) => {
  const b = req.body, num = (v, lo, hi) => Number.isInteger(+v) && +v >= lo && +v <= hi;
  if (!num(b.threshold, 1, 100) || !num(b.late, 0, 60) || !num(b.length, 10, 180) || !String(b.session || '').trim()) throw fail(400, 'Check the values: threshold 1–100, late window 0–60, session length 10–180 minutes.');
  const v = { threshold: +b.threshold, late: +b.late, length: +b.length, session: String(b.session).trim() };
  await setSetting('system', v); audit('settings_update', req.user.id, JSON.stringify(v));
  res.json(v);
}));

// Used by the student scan screen to show GPS/network readiness before scanning.
r.get('/attendance/verify', auth('student'), wrap(async (req, res) => {
  const n = (v) => (v === undefined || v === '' ? undefined : Number(v));
  res.json(checkEnv(req, await getSetting('verification'), { lat: n(req.query.lat), lng: n(req.query.lng), accuracy: n(req.query.accuracy) }));
}));

export default r;
