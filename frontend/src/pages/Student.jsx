import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Percent, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import Hello from '../components/Hello';
import Tabs from '../components/Tabs';
import AcademicAlerts from '../components/AcademicAlerts';
import { http } from '../services/api';
import { useSession } from '../context/SessionContext';
import { useAuth } from '../context/AuthContext';

const tone = (p, th) => (p >= th ? 'var(--ok)' : p >= th - 10 ? 'var(--warn)' : 'var(--crit)');
const SC = { Present: 'var(--ok)', Absent: 'var(--crit)', Late: 'var(--warn)' };
const Bar = ({ p, th }) => <i className="pbar" role="img" aria-label={`${p}% attendance`}><u style={{ width: p + '%', background: tone(p, th) }} /><s /></i>;
const HistoryTable = ({ rows }) => <div className="scroll"><table className="tbl"><thead><tr><th>Date</th><th>Subject</th><th>Session</th><th>Status</th></tr></thead><tbody>
  {rows.map((h) => <tr key={h.id}><td>{h.date}</td><td>{h.subject}</td><td>{h.session}</td><td style={{ color: SC[h.status], fontWeight: 500 }}>{h.status}</td></tr>)}
  {!rows.length && <tr><td colSpan="4" className="muted">No sessions match.</td></tr>}</tbody></table></div>;

// The signed-in student's per-subject analytics (server-calculated) plus their attendance history.
export function useMy() {
  const { user } = useAuth(); const { scans, tick } = useSession(); const [a, setA] = useState(null), [err, setErr] = useState('');
  useEffect(() => { if (user.role !== 'student') return; http('/analytics/my').then((r) => { setA(r); setErr(''); }).catch((e) => setErr(e.message)); }, [tick]);
  return { loaded: !!a, err, threshold: a?.threshold ?? 75, overall: a?.overall, subjects: a?.subjects || [], history: scans };
}
const Wait = ({ err }) => (err ? <div className="alert" role="alert">{err}</div> : <p className="muted">Loading…</p>);

export function StudentDashboard() {
  const { loaded, err, subjects, history, overall, threshold: th } = useMy(); const [tab, setTab] = useState('subjects');
  if (!loaded) return <Wait err={err} />;
  const low = subjects.filter((s) => s.low_attendance);
  return (<>
    <Hello note="Your attendance" />
    <div className="metrics">
      <div><i className="chip"><Percent size={18} /></i><b style={{ color: overall.total ? tone(overall.percentage, th) : undefined }}>{overall.total ? `${overall.percentage}%` : '—'}</b><span>Overall attendance</span></div>
      <div><i className="chip"><CheckCircle2 size={18} /></i><b>{overall.attended}</b><span>Classes attended</span></div>
      <div><i className="chip"><XCircle size={18} /></i><b>{overall.missed}</b><span>Classes missed</span></div>
      <div><i className="chip"><AlertTriangle size={18} /></i><b style={{ color: low.length ? 'var(--crit)' : undefined }}>{low.length}</b><span>Subjects below {th}%</span></div></div>
    {low.map((s) => <div className="alert warn" role="status" key={s.code} style={{ marginBottom: 8 }}><AlertTriangle size={16} style={{ flex: 'none', marginTop: 3 }} /><span>Your attendance in {s.name} is currently {s.percentage}%. You need to attend the next {s.needed} class{s.needed === 1 ? '' : 'es'} in a row to reach {th}%.</span></div>)}
    <div style={{ marginTop: 20 }}><AcademicAlerts subjects={subjects} threshold={th} hideAttendance /></div>
    <Tabs value={tab} onChange={setTab} tabs={[['subjects', 'Subjects'], ['recent', 'Recent sessions']]} />
    {tab === 'subjects' && <section className="panel"><div className="scroll"><table className="tbl"><thead><tr><th>Subject</th><th>Attended</th><th>Total</th><th style={{ width: '30%' }}>Progress</th><th>%</th></tr></thead><tbody>
      {subjects.map((s) => <tr key={s.code}><td>{s.name} <span className="muted tight">{s.code}</span></td><td>{s.attended}</td><td>{s.total}</td><td><Bar p={s.percentage} th={th} /></td><td style={{ color: s.total ? tone(s.percentage, th) : undefined, fontWeight: 500 }}>{s.total ? `${s.percentage}%` : '—'}</td></tr>)}
      {!subjects.length && <tr><td colSpan="5" className="muted">You are not enrolled in any course yet. Contact your administrator.</td></tr>}</tbody></table></div>
      <p className="muted tight" style={{ marginTop: 8 }}>The vertical mark on each bar is the {th}% requirement.</p></section>}
    {tab === 'recent' && <section className="panel"><HistoryTable rows={history.slice(0, 8)} /><p style={{ marginBottom: 0 }}><Link to="/student/history" className="link">Full history</Link></p></section>}
  </>);
}

export function StudentSubjects() {
  const { loaded, err, subjects, history, threshold: th } = useMy(); const [sel, setSel] = useState('');
  if (!loaded) return <Wait err={err} />;
  const cur = subjects.find((s) => s.code === sel) || subjects[0];
  return (<>
    <h1 className="h1">By subject</h1>
    <div className="scroll"><table className="tbl"><thead><tr><th>Subject</th><th>Attended / total</th><th>%</th><th>Status</th><th>To reach {th}%</th></tr></thead><tbody>
      {subjects.map((s) => <tr key={s.code} className={cur?.code === s.code ? 'rowsel' : ''}><td><button className="link strong" onClick={() => setSel(s.code)}>{s.name}</button> <span className="muted tight">{s.code}</span></td><td>{s.attended} / {s.total}</td><td style={{ color: s.total ? tone(s.percentage, th) : undefined, fontWeight: 500 }}>{s.total ? `${s.percentage}%` : '—'}</td><td>{!s.total ? 'No sessions yet' : s.percentage >= th ? 'On track' : s.percentage >= th - 10 ? 'Warning' : 'Critical'}</td><td>{s.needed ? `${s.needed} more classes` : '—'}</td></tr>)}
      {!subjects.length && <tr><td colSpan="5" className="muted">You are not enrolled in any course yet.</td></tr>}</tbody></table></div>
    {cur && <section style={{ marginTop: 28 }}><h2>{cur.name} · sessions</h2><HistoryTable rows={history.filter((h) => h.subject === cur.name).slice(0, 12)} /></section>}
  </>);
}

export function StudentHistory() {
  const { loaded, err, subjects, history } = useMy(); const [q, setQ] = useState(''), [sub, setSub] = useState(''), [st, setSt] = useState(''), [pg, setPg] = useState(0);
  if (!loaded) return <Wait err={err} />;
  const rows = history.filter((h) => (!sub || h.subject === sub) && (!st || h.status === st) && (h.date + h.session + h.subject).toLowerCase().includes(q.toLowerCase()));
  const pages = Math.max(1, Math.ceil(rows.length / 10)), cur = Math.min(pg, pages - 1), reset = (f) => (e) => { f(e.target.value); setPg(0); };
  return (<>
    <h1 className="h1">Attendance history</h1>
    <div className="bar"><label className="search"><Search size={16} /><input placeholder="Search date, subject or session" value={q} onChange={reset(setQ)} /></label>
      <select value={sub} onChange={reset(setSub)} aria-label="Subject"><option value="">All subjects</option>{subjects.map((s) => <option key={s.code}>{s.name}</option>)}</select>
      <select value={st} onChange={reset(setSt)} aria-label="Status"><option value="">All statuses</option><option>Present</option><option>Absent</option><option>Late</option></select><span className="muted tight">{rows.length} sessions</span></div>
    <HistoryTable rows={rows.slice(cur * 10, cur * 10 + 10)} />
    <div className="pager"><button className="btn" disabled={cur === 0} onClick={() => setPg(cur - 1)}>Previous</button><span>Page {cur + 1} of {pages}</span><button className="btn" disabled={cur >= pages - 1} onClick={() => setPg(cur + 1)}>Next</button></div>
  </>);
}
