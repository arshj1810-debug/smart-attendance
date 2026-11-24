// Campus verification for QR scans: client-reported GPS inside a geofence + request IP inside campus ranges.
// Browsers cannot read the Wi-Fi name, so "authorised network" means the request arrives from the configured IP ranges.
// GPS is reported by the device and can be spoofed on a rooted phone: treat it as a strong deterrent, not proof.
export const MAX_ACCURACY_M = 100;
const ip4 = (s) => { const m = String(s).replace(/^::ffff:/, '').split('.').map(Number); return m.length === 4 && m.every((n) => Number.isInteger(n) && n >= 0 && n < 256) ? m[0] * 16777216 + m[1] * 65536 + m[2] * 256 + m[3] : null; };
const inCidr = (ip, cidr) => {
  if (cidr === '::1') return ip === '::1' || ip === '::ffff:127.0.0.1';
  const [b, bits = '32'] = cidr.split('/'); const a = ip4(ip), n = ip4(b); if (a === null || n === null) return false;
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return ((a & mask) >>> 0) === ((n & mask) >>> 0);
};
const haversine = (la1, lo1, la2, lo2) => {
  const R = 6371000, r = (x) => (x * Math.PI) / 180, dLa = r(la2 - la1), dLo = r(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};
export function checkEnv(req, cfg, { lat, lng, accuracy } = {}) {
  const out = { network: { enabled: cfg.network.enabled, ok: true, message: 'Network check is off.' }, gps: { enabled: cfg.geofence.enabled, ok: true, message: 'Location check is off.' } };
  if (cfg.network.enabled) {
    const ok = cfg.network.ranges.some((c) => inCidr(req.ip, c));
    out.network = { enabled: true, ok, message: ok ? 'Connected to the campus network.' : 'Connect to the campus Wi-Fi to mark attendance.' };
  }
  if (cfg.geofence.enabled) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) out.gps = { enabled: true, ok: false, message: 'Location is required. Allow location access.' };
    else {
      const d = Math.round(haversine(lat, lng, cfg.geofence.lat, cfg.geofence.lng)), acc = Number(accuracy) || 0;
      const ok = d <= cfg.geofence.radius && acc <= MAX_ACCURACY_M;
      out.gps = { enabled: true, ok, distance: d, accuracy: Math.round(acc), message: acc > MAX_ACCURACY_M ? `GPS signal is too weak (±${Math.round(acc)} m). Move to an open area.` : ok ? `Inside campus, ${d} m from the centre.` : `You are ${d} m from campus. Attendance is allowed within ${cfg.geofence.radius} m.` };
    }
  }
  out.ok = out.network.ok && out.gps.ok;
  return out;
}
