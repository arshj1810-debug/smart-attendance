import { useState, useEffect } from 'react';
import { put, post, http } from '../services/api';
import { useAuth } from '../context/AuthContext';
import VerifyConfig from '../components/VerifyConfig';
import { getTheme, setTheme } from '../utils/theme';
const load = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k)) }; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
export default function Settings() {
  const { user, updateUser } = useAuth(); const role = user.role; const k = 'prefs:' + user.id; const [theme, setT] = useState(getTheme);
  const [p, setP] = useState(() => ({ ...load(k, { low: true, session: true, updates: false }), name: user.name, email: user.email }));
  const [sys, setSys] = useState(null);
  useEffect(() => { if (role === 'admin') http('/settings').then(setSys).catch((e) => setErr(e.message)); }, [role]);
  const [pw, setPw] = useState({ cur: '', next: '', again: '' }); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const ok = (m) => { setErr(''); setMsg(m); setTimeout(() => setMsg(''), 3000); };
  const changePw = async (e) => { e.preventDefault(); if (pw.next.length < 8) return setErr('New password must be at least 8 characters.'); if (pw.next !== pw.again) return setErr('The new passwords do not match.'); try { await post('/auth/change-password', { current: pw.cur, next: pw.next }); setPw({ cur: '', next: '', again: '' }); ok('Password updated.'); } catch (x) { setErr(x.message); } };
  const saveProfile = async (e) => { e.preventDefault(); try { const r = await put('/auth/profile', { name: p.name, email: p.email }); updateUser(r.user); store(k, p); ok('Personal information saved.'); } catch (x) { setErr(x.message); } };
  const saveSys = async (e) => { e.preventDefault(); try { setSys(await put('/settings', sys)); ok('System configuration saved.'); } catch (x) { setErr(x.message); } };
  const T = (key, label) => <label className="check"><input type="checkbox" checked={p[key]} onChange={(e) => setP({ ...p, [key]: e.target.checked })} /> {label}</label>;
  const initials = user.name.split(' ').filter((w) => !w.endsWith('.')).map((w) => w[0]).slice(0, 2).join('');
  const info = [['ID', user.id], ['Email', user.email], ['Department', user.department], ...(role === 'student' ? [['Programme', user.course], ['Semester', user.semester]] : [])].filter(([, v]) => v);
  return (<>
    <h1 className="h1">{role === 'admin' ? 'Settings' : 'Profile & settings'}</h1>
    {(msg || err) && <div className={`alert ${err ? '' : 'info'}`} role="status">{err || msg}</div>}
    <section className="prof"><div className="avatar" aria-hidden="true">{initials}</div><div><b>{user.name}</b><dl className="dl">{info.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl></div></section>
    <div className="two">
      <form className="stack" onSubmit={saveProfile}><h2>Personal information</h2>
        <label className="field"><span>Name</span><input required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
        <label className="field"><span>Email</span><input required type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} /></label>
        <h2 style={{ marginTop: 12 }}>Notification preferences</h2>{T('low', 'Low attendance warnings')}{T('session', 'New class sessions')}{T('updates', 'Attendance updates')}
        <button className="btn primary" style={{ alignSelf: 'flex-start' }}>Save changes</button></form>
      <form className="stack" onSubmit={changePw}><h2>Change password</h2>
        {[['cur', 'Current password'], ['next', 'New password'], ['again', 'Confirm new password']].map(([x, l]) => <label className="field" key={x}><span>{l}</span><input required type="password" autoComplete="off" value={pw[x]} onChange={(e) => setPw({ ...pw, [x]: e.target.value })} /></label>)}
        <button className="btn primary" style={{ alignSelf: 'flex-start' }}>Update password</button></form></div>
    <section className="stack" style={{ maxWidth: 420, marginTop: 24 }}><h2>Accessibility</h2>
      <fieldset className="themes"><legend>Theme</legend>
        {[['light', 'Light'], ['dark', 'Dark'], ['system', 'Match device']].map(([v, l]) => <label key={v} className={theme === v ? 'on' : ''}><input type="radio" name="theme" checked={theme === v} onChange={() => { setT(v); setTheme(v); ok(`Theme set to ${l.toLowerCase()}.`); }} /><i className={`sw ${v}`} />{l}</label>)}</fieldset>
      <p className="muted tight">Your choice is saved on this device and applies immediately.</p></section>
    {role === 'admin' && <VerifyConfig />}
    {role === 'admin' && sys && <form className="stack" style={{ maxWidth: 420, marginTop: 24 }} onSubmit={saveSys}><h2>System configuration</h2>
      {[['threshold', 'Low-attendance threshold (%)', 1, 100], ['late', 'Late window (minutes)', 0, 60], ['length', 'Default session length (minutes)', 10, 180]].map(([x, l, mn, mx]) => <label className="field" key={x}><span>{l}</span><input type="number" min={mn} max={mx} required value={sys[x]} onChange={(e) => setSys({ ...sys, [x]: Number(e.target.value) })} /></label>)}
      <label className="field"><span>Academic session</span><input required value={sys.session} onChange={(e) => setSys({ ...sys, session: e.target.value })} /></label>
      <p className="muted tight">QR refresh interval is fixed at 2 seconds and enforced by the server. The threshold drives every warning, report and alert.</p>
      <button className="btn primary" style={{ alignSelf: 'flex-start' }}>Save configuration</button></form>}
  </>);
}
