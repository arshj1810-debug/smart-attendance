import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Search, BookOpen, Users, CalendarCheck, Percent } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Hello from '../components/Hello';
import { useAuth } from '../context/AuthContext';
import { useSession } from '../context/SessionContext';
import { http } from '../services/api';

export const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
export const useNow = () => { const [n, setN] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setN(Date.now()), 1000); return () => clearInterval(t); }, []); return n; };
const nameOf = (s, id) => s?.roster?.find((x) => x.id === id)?.name || id;
const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export function FacultyDashboard() {
  const { session, start, tick } = useSession(); const nav = useNavigate();
  const [d, setD] = useState(null), [err, setErr] = useState('');
  useEffect(() => { http('/faculty/overview').then((r) => { setD(r); setErr(''); }).catch((e) => setErr(e.message)); }, [tick]);
  if (!d) return err ? <div className="alert" role="alert">{err}</div> : <p className="muted">Loading…</p>;
  const rows = d.schedule.rows, th = d.threshold;
  const go = async (c) => { try { if (!session) await start(c); nav('/faculty/sessions'); } catch (e) { alert(e.message); } };
  const M = [['Courses', d.metrics.courses, BookOpen], ['Students', d.metrics.students, Users], ['Classes today', d.metrics.classesToday, CalendarCheck], ['Average attendance', d.metrics.average == null ? '—' : `${d.metrics.average}%`, Percent]];
  return (<>
    <Hello note="Today’s classes" />
    <div className="metrics">{M.map(([l, v, I]) => <div key={l}><i className="chip"><I size={18} /></i><b>{v}</b><span>{l}</span></div>)}</div>
    <section><h2>Schedule</h2>
      {d.schedule.unscheduled && rows.length > 0 && <p className="muted tight">No classes are on the timetable for today. You can still start a session for any of your courses.</p>}
      <div className="scroll"><table className="tbl"><thead><tr><th>Time</th><th>Course</th><th>Room</th><th>Students</th><th>Status</th><th /></tr></thead><tbody>
        {rows.map((c) => <tr key={c.code + c.time}><td>{c.time}</td><td>{c.name} <span className="muted tight">{c.code}</span></td><td>{c.room || '—'}</td><td>{c.students}</td>
          <td style={{ color: c.state === 'Active' ? 'var(--ok)' : undefined, fontWeight: c.state === 'Active' ? 500 : 400 }}>{c.state}</td>
          <td className="act">
            {c.state === 'Active' && <button className="btn primary" onClick={() => go(c)}>View attendance</button>}
            {c.state !== 'Active' && <button className={c.state === 'Completed' ? 'btn' : 'btn primary'} disabled={!!session} title={session ? 'End the active session first' : ''} onClick={() => go(c)}>{c.state === 'Completed' ? 'Start again' : 'Start attendance'}</button>}
          </td></tr>)}
        {!rows.length && <tr><td colSpan="6" className="muted">No courses are assigned to you yet. Ask an administrator to assign one.</td></tr>}</tbody></table></div></section>
    <div className="two"><section><h2>Recent attendance</h2>
      {d.trend.length ? <ResponsiveContainer width="100%" height={200}><LineChart data={d.trend}><XAxis dataKey="d" tickLine={false} axisLine={false} fontSize={12} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={12} width={36} unit="%" /><Tooltip formatter={(v) => `${v}%`} /><ReferenceLine y={th} stroke="var(--crit)" strokeDasharray="3 3" /><Line dataKey="pct" stroke="var(--chart)" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer> : <p className="muted">No sessions recorded yet.</p>}</section>
      <section><h2>By course</h2>{d.byCourse.map(([n, v]) => <div className="hb" key={n}><span>{n}</span><i><u style={{ width: v + '%', background: v < th ? 'var(--crit)' : 'var(--accent)' }} /></i><b>{v}%</b></div>)}{!d.byCourse.length && <p className="muted">No data yet.</p>}</section></div>
    <div className="two"><section><h2>Students below {th}% <small>{d.low.length}</small></h2>
      <ul className="feed">{d.low.slice(0, 6).map((s) => <li key={s.id + s.course}>{s.name} <span className="muted tight">· {s.course}</span><b className="crit" style={{ float: 'right' }}>{s.percentage}%</b></li>)}{!d.low.length && <li className="muted">Everyone is on track.</li>}</ul></section>
      <section><h2>Recent sessions</h2><ul className="feed">{d.recent.map((p, i) => <li key={i}>{p.name} <span className="muted tight">· {p.date}</span><b style={{ float: 'right' }}>{p.present}/{p.total}</b></li>)}{!d.recent.length && <li className="muted">No finished sessions yet.</li>}</ul></section></div>
  </>);
}

export function Sessions() {
  const { user } = useAuth(); const { session, marks, past, end, setQrOn } = useSession(); const nav = useNavigate();
  const now = useNow(); const [show, setShow] = useState(true), [err, setErr] = useState('');
  if (!session) return (<>
    <h1 className="h1">Sessions</h1><p className="muted">No active session. Start one from <Link to="/faculty/dashboard" className="link">Today’s schedule</Link>.</p>
    <section><h2>Recent sessions</h2><div className="scroll"><table className="tbl"><thead><tr><th>Date</th><th>Course</th><th>Present</th><th>Attendance</th><th /></tr></thead><tbody>
      {past.map((p) => <tr key={p.id}><td>{p.date}</td><td>{p.name} <span className="muted tight">{p.code}</span></td><td>{p.present} / {p.total}</td><td>{pctOf(p.present, p.total)}%</td><td className="act">{p.locked ? <span className="muted tight">Locked</span> : <Link className="link" to={`/faculty/attendance?edit=${p.id}`}>Edit</Link>}</td></tr>)}
      {!past.length && <tr><td colSpan="5" className="muted">No finished sessions yet.</td></tr>}</tbody></table></div></section></>);
  const ids = Object.keys(marks), present = ids.filter((k) => marks[k] === 'Present'), late = ids.filter((k) => marks[k] === 'Late'), rest = ids.filter((k) => marks[k] === 'Absent');
  const left = session.startedAt + session.durationMin * 60000 - now;
  const finish = async () => { if (!confirm('End this session? Attendance will be saved and low-attendance warnings will be sent.')) return; try { await end(); nav('/faculty/sessions'); } catch (e) { setErr(e.message); } };
  return (<>
    <div className="head"><div><h1 className="h1">{session.name} <span className="muted tight">{session.code}</span></h1>
      <span className="muted tight">{user.name} · {session.room || 'No room'} · {session.time || 'Any time'} · <b style={{ color: 'var(--ok)' }}>Active</b> · {left > 0 ? `${fmt(left)} left` : 'planned time is over'}</span></div>
      <div className="gap"><button className="btn primary" onClick={() => { setQrOn?.(true); nav('/faculty/qr'); }}>Generate QR code</button>
        <button className="btn" onClick={() => nav('/faculty/attendance')}>Manual attendance</button>
        <button className="btn" onClick={() => setShow(!show)}>{show ? 'Hide' : 'View'} attendance</button>
        <button className="btn" onClick={finish}>End session</button></div></div>
    {err && <div className="alert" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
    <div className="metrics"><div><b>{present.length + late.length}</b><span>Marked present</span></div><div><b>{late.length}</b><span>Late</span></div><div><b>{rest.length}</b><span>Not yet marked</span></div><div><b>{ids.length}</b><span>Enrolled</span></div></div>
    {show && <div className="two"><section><h2>Present <small>{present.length + late.length}</small></h2><ul className="feed">{[...present, ...late].map((id) => <li key={id}>{nameOf(session, id)} <span className="muted tight">· {id}{marks[id] === 'Late' ? ' · Late' : ''}</span></li>)}{!present.length && !late.length && <li className="muted">No one marked yet. Show the QR code or use manual attendance.</li>}</ul></section>
      <section><h2>Not yet marked <small>{rest.length}</small></h2><ul className="feed">{rest.map((id) => <li key={id}>{nameOf(session, id)} <span className="muted tight">· {id}</span></li>)}</ul></section></div>}
  </>);
}

export function QRScreen() {
  const { session, marks, loaded } = useSession(); const nav = useNavigate(); const now = useNow();
  const [token, setToken] = useState(''), [err, setErr] = useState('');
  useEffect(() => {
    if (!session) { if (loaded) nav('/faculty/sessions', { replace: true }); return; }
    let off = false;
    const gen = async () => { try { const r = await http(`/sessions/${session.id}/qr`); if (!off) { setToken(r.token); setErr(''); } } catch (e) { if (!off) setErr(e.message); } };
    gen(); const t = setInterval(gen, 2000); return () => { off = true; clearInterval(t); };
  }, [session?.id, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!session) return null;
  const ids = Object.keys(marks), marked = ids.filter((k) => marks[k] !== 'Absent').length;
  return (<div className="qrpage">
    <button className="btn qrexit" onClick={() => nav('/faculty/sessions')}>Exit full screen</button>
    <div className="qrbox"><QRCodeSVG value={`ATT1:${token || 'x'}`} size={360} level="M" includeMargin style={{ width: '100%', height: 'auto' }} /><div className="qrbar"><i key={token} /></div><p className="muted tight">Refreshes every 2 seconds{err ? ` · ${err}` : ''}</p></div>
    <div className="qrinfo"><h1>{session.name}</h1><p>{session.code} · {session.faculty}</p><p>{session.time} · {session.room}</p>
      <div className="big"><b>{marked}</b><span>of {ids.length} students marked</span></div>
      <div className="big"><b>{fmt(session.startedAt + session.durationMin * 60000 - now)}</b><span>session time remaining</span></div>
      <p className="muted">Scan with the student app. Token validation and replay checks run on the server.</p></div></div>);
}

export function ManualAttendance() {
  const { session, marks, past, setMark, setAll, updatePast, error, clearError } = useSession();
  const [sp] = useSearchParams(); const editId = sp.get('edit'); const target = editId ? past.find((p) => p.id === editId) : null;
  const [local, setLocal] = useState(null), [q, setQ] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  if (editId && (!target || target.locked)) return (<><h1 className="h1">Manual attendance</h1><p className="muted">{target ? 'This session is past the edit window and is locked.' : 'Session not found.'} <Link to="/faculty/sessions" className="link">Back to sessions</Link></p></>);
  if (!editId && !session) return (<><h1 className="h1">Manual attendance</h1><p className="muted">Start a session from <Link to="/faculty/dashboard" className="link">Today’s schedule</Link> to mark attendance, or edit a saved one from <Link to="/faculty/sessions" className="link">Sessions</Link>.</p></>);
  const src = editId ? target : session, cur = editId ? (local || target.marks) : marks, roster = src.roster || [];
  const n = (st) => Object.values(cur).filter((v) => v === st).length;
  const put = (id, st) => { setMsg(''); setErr(''); if (editId) setLocal({ ...cur, [id]: st }); else setMark(id, st); };
  const putAll = (st) => { setMsg(''); setErr(''); if (editId) setLocal(Object.fromEntries(roster.map((s) => [s.id, st]))); else setAll(st); };
  const save = async () => {
    setBusy(true); setErr('');
    try { if (editId) { await updatePast(editId, cur); setLocal(null); } else await updatePast(session.id, cur); setMsg(`Attendance saved for ${src.name}: ${n('Present')} present, ${n('Late')} late, ${n('Absent')} absent.`); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const list = roster.filter((s) => (s.name + s.id).toLowerCase().includes(q.toLowerCase()));
  return (<>
    <div className="head"><div><h1 className="h1">Manual attendance</h1><span className="muted tight">{editId ? `${src.name} · ${target.date} · editing a saved session` : `${src.name} · ${src.code}`}</span></div>
      <div className="gap wrap"><button className="btn" onClick={() => putAll('Present')}>Mark all present</button><button className="btn" onClick={() => putAll('Absent')}>Reset</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save attendance'}</button></div></div>
    <div className="metrics"><div><b>{n('Present')}</b><span>Present</span></div><div><b>{n('Late')}</b><span>Late</span></div><div><b>{n('Absent')}</b><span>Absent</span></div></div>
    {msg && <div className="alert info" role="status" style={{ marginBottom: 12 }}>{msg}</div>}
    {(err || error) && <div className="alert" role="alert" style={{ marginBottom: 12 }} onClick={clearError}>{err || error}</div>}
    <div className="bar"><label className="search"><Search size={16} /><input placeholder="Search students" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
    <div className="scroll"><table className="tbl"><thead><tr><th>Roll number</th><th>Student name</th><th>Status</th></tr></thead><tbody>
      {list.map((s) => <tr key={s.id}><td>{s.id}</td><td>{s.name}</td><td><div className="seg" role="group" aria-label={`Status for ${s.name}`}>
        {['Present', 'Absent', 'Late'].map((st) => <button key={st} className={cur[s.id] === st ? `on ${st}` : ''} onClick={() => put(s.id, st)}>{st}</button>)}</div></td></tr>)}
      {!list.length && <tr><td colSpan="3" className="muted">{roster.length ? 'No students match your search.' : 'No students are enrolled in this course.'}</td></tr>}</tbody></table></div>
  </>);
}
