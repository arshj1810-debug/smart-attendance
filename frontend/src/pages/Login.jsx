import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Mail, Lock, ArrowRight, QrCode, Activity, BellRing, ShieldCheck, GraduationCap, UserRound } from 'lucide-react';
import Logo from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { HOME } from '../config/nav';
const FEATS = [[QrCode, 'QR attendance', 'A code that refreshes every 2 seconds and works once.'], [Activity, 'Live monitoring', 'See who has checked in as it happens.'], [BellRing, 'Early alerts', 'Warnings before attendance falls below 75%.']];
const ROLES = [['admin', 'Admin', ShieldCheck], ['faculty', 'Faculty', GraduationCap], ['student', 'Student', UserRound]];
export default function Login() {
  const { user, login, loginAs, demo } = useAuth(); const nav = useNavigate();
  const [f, setF] = useState({ email: '', password: '', remember: false }), [show, setShow] = useState(false), [busy, setBusy] = useState(false);
  const [err, setErr] = useState(''), [fe, setFe] = useState({}), [note, setNote] = useState('');
  if (user) return <Navigate to={HOME[user.role]} replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const fail = (x) => { setErr(x.message); setBusy(false); };
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setNote(''); const v = {};
    if (!/^\S+@\S+\.\S+$/.test(f.email)) v.email = 'Enter a valid institutional email address.';
    if (f.password.length < 6) v.password = 'Password must be at least 6 characters.';
    setFe(v); if (Object.keys(v).length) return; setBusy(true);
    try { const u = await login(f.email, f.password, f.remember); nav(HOME[u.role]); } catch (x) { fail(x); }
  };
  const quick = async (r) => { setBusy(true); setErr(''); try { const u = await loginAs(r); nav(HOME[u.role]); } catch (x) { fail(x); } };
  return (
    <div className="login">
      <aside className="login-side"><span className="orb o1" /><span className="orb o2" />
        <div className="rise"><Logo /></div>
        <div><h2 className="rise d1">Roll call in two seconds, not ten minutes.</h2>
          {FEATS.map(([I, t, d], i) => <div className="feat rise" style={{ animationDelay: `${0.2 + i * 0.1}s` }} key={t}><i className="chip"><I size={18} /></i><div><b>{t}</b><p>{d}</p></div></div>)}</div>
        <small>Smart Attendance Management System</small></aside>
      <main className="login-main">
        <form className="login-form auth-card" onSubmit={submit} noValidate>
          <div className="only-mobile"><Logo /></div>
          <div><h1 className="h1">Welcome back</h1><p className="muted" style={{ margin: 0 }}>Sign in with the email issued by your institution.</p></div>
          {err && <div className="alert" role="alert">{err}</div>}{note && <div className="alert info" role="status">{note}</div>}
          <label className="field"><span>Email</span><div className="ifield"><Mail size={16} /><input type="email" placeholder="name@college.edu" autoComplete="username" value={f.email} onChange={set('email')} aria-invalid={!!fe.email} /></div>{fe.email && <em>{fe.email}</em>}</label>
          <label className="field"><span>Password</span><div className="ifield"><Lock size={16} /><input type={show ? 'text' : 'password'} placeholder="Your password" autoComplete="current-password" value={f.password} onChange={set('password')} aria-invalid={!!fe.password} />
            <button type="button" className="icon-btn" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>{fe.password && <em>{fe.password}</em>}</label>
          <div className="row"><label className="check"><input type="checkbox" checked={f.remember} onChange={set('remember')} /> Remember me</label>
            <button type="button" className="link" onClick={() => setNote('Password resets are handled by your administrator for now.')}>Forgot password?</button></div>
          <button className="btn primary lg" disabled={busy}>{busy ? <><Loader2 size={16} className="spin" /> Signing in</> : <>Sign in <ArrowRight size={16} /></>}</button>
          {demo && <div className="demo-login"><span>Quick demo access · password demo123</span>
            <div className="roles">{ROLES.map(([r, l, I]) => <button key={r} type="button" className="role" disabled={busy} onClick={() => quick(r)}><I size={18} />{l}</button>)}</div></div>}
        </form></main>
    </div>
  );
}
