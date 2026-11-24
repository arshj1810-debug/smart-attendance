import { one, query } from '../db.js';

export const DEFAULTS = {
  system: { threshold: 75, late: 10, length: 50, session: 'Jul–Dec 2026' },
  // Both checks start switched off so a fresh install works anywhere; an admin turns them on in Settings.
  verification: {
    geofence: { enabled: false, lat: 23.2599, lng: 77.4126, radius: 300 },
    network: { enabled: false, ranges: ['127.0.0.0/8', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'] },
  },
};
const cache = new Map();
export async function getSetting(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 3000) return hit.v;
  const row = await one('SELECT value FROM settings WHERE key = $1', [key]);
  const v = row ? { ...DEFAULTS[key], ...row.value } : DEFAULTS[key];
  cache.set(key, { v, t: Date.now() });
  return v;
}
export async function setSetting(key, value) {
  await query('INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, JSON.stringify(value)]);
  cache.delete(key);
  return value;
}
export async function initSettings() {
  for (const [k, v] of Object.entries(DEFAULTS)) await query('INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING', [k, JSON.stringify(v)]);
}
