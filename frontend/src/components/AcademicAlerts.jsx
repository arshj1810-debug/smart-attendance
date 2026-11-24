import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ListChecks, Trophy, CheckCircle2 } from 'lucide-react';
import { http } from '../services/api';
const when = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
// Live academic status for students: attendance warnings (from props), open quizzes and recent results (polled every 10s).
export default function AcademicAlerts({ subjects = [], threshold = 75, hideAttendance = false }) {
  const [quizzes, setQ] = useState([]), [results, setR] = useState([]);
  useEffect(() => {
    let off = false; const run = async () => { try { const [q, r] = await Promise.all([http('/quizzes/'), http('/results/me/')]); if (!off) { setQ(q.quizzes); setR(r.results); } } catch { /* offline: keep last */ } };
    run(); const t = setInterval(run, 10000); return () => { off = true; clearInterval(t); };
  }, []);
  const items = [];
  if (!hideAttendance) subjects.forEach((s) => { if (s.total && s.percentage < threshold) items.push({ k: 'a' + s.code, I: AlertTriangle, tone: s.percentage < threshold - 10 ? 'crit' : 'warn', title: `${s.name} attendance is ${s.percentage}%`, body: `Attend the next ${s.needed} class${s.needed === 1 ? '' : 'es'} in a row to reach ${threshold}%.`, to: '/student/attendance' }); });
  quizzes.filter((q) => q.status === 'available' || q.status === 'in_progress').forEach((q) => items.push({ k: 'q' + q.id, I: ListChecks, tone: 'info', title: `${q.status === 'in_progress' ? 'Resume' : 'New'} quiz: ${q.title}`, body: `${q.courseName} · ${q.durationMin} min · due ${when(q.deadline)}`, to: '/student/quizzes' }));
  results.slice(0, 2).forEach((r) => items.push({ k: 'r' + r.quizId, I: Trophy, tone: r.percent < 40 ? 'warn' : 'ok', title: `Result: ${r.title}`, body: `You scored ${r.score}/${r.total} (${r.percent}%).`, to: '/student/results' }));
  return (<section className="panel" style={{ marginBottom: 20 }}><h2>Academic status <small>live</small></h2>
    {items.length ? <ul className="alerts">{items.map(({ k, I, tone, title, body, to }) => <li key={k}><Link to={to} className={`arow ${tone}`}><i className="chip sm"><I size={16} /></i><div className="grow"><b>{title}</b><p>{body}</p></div></Link></li>)}</ul>
      : <p className="muted" style={{ margin: 0 }}><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> You are on track. No alerts right now.</p>}</section>);
}
