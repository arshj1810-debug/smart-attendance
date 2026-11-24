import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { http } from '../services/api';
export default function VerifyConfig() {
  const [c, setC] = useState(null), [ranges, setRanges] = useState(''), [msg, setMsg] = useState(''), [err, setErr] = useState(false);
  useEffect(() => { http('/config/').then((r) => { setC(r); setRanges(r.network.ranges.join(', ')); }).catch((e) => { setErr(true); setMsg(e.message); }); }, []);
  if (!c) return msg ? <div className="alert" style={{ marginTop: 24 }}>{msg}</div> : null;
  const g = c.geofence, n = c.network, setG = (k, v) => setC({ ...c, geofence: { ...g, [k]: v } });
  const here = () => navigator.geolocation?.getCurrentPosition((p) => setC({ ...c, geofence: { ...g, lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) } }), () => { setErr(true); setMsg('Location access was blocked.'); }, { enableHighAccuracy: true });
  const save = async (e) => { e.preventDefault(); try { const r = await http('/config/', { method: 'PUT', body: JSON.stringify({ ...c, network: { ...n, ranges: ranges.split(',') } }) }); setC(r); setRanges(r.network.ranges.join(', ')); setErr(false); setMsg('Verification settings saved.'); } catch (x) { setErr(true); setMsg(x.message); } };
  const num = (k, l) => <label className="field"><span>{l}</span><input type="number" step="any" required value={g[k]} onChange={(e) => setG(k, e.target.value)} /></label>;
  return (<form className="stack" style={{ maxWidth: 420, marginTop: 24 }} onSubmit={save}><h2>Attendance verification</h2>
    <label className="check"><input type="checkbox" checked={g.enabled} onChange={(e) => setG('enabled', e.target.checked)} /> Require students to be inside the campus (GPS)</label>
    {num('lat', 'Campus latitude')}{num('lng', 'Campus longitude')}{num('radius', 'Allowed radius (metres)')}
    <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={here}><MapPin size={16} />Use my current location</button>
    <label className="check"><input type="checkbox" checked={n.enabled} onChange={(e) => setC({ ...c, network: { ...n, enabled: e.target.checked } })} /> Require the campus network (Wi-Fi)</label>
    <label className="field"><span>Allowed network ranges (comma separated)</span><input value={ranges} onChange={(e) => setRanges(e.target.value)} /></label>
    <p className="muted tight">Browsers cannot read the Wi-Fi name, so the server checks that the request comes from these IP ranges.</p>
    {msg && <p className={err ? 'crit' : ''} role="status" style={{ margin: 0 }}>{msg}</p>}
    <button className="btn primary" style={{ alignSelf: 'flex-start' }}>Save verification settings</button></form>);
}
