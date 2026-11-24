import { useState, useEffect, useCallback } from 'react';
import { Users, GraduationCap, BookOpen, Percent } from 'lucide-react';
import Hello from '../components/Hello';
import Tabs from '../components/Tabs';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import ManagePage from '../components/ManagePage';
import { useMeta } from '../services/meta';
import { http, post, del } from '../services/api';
import { useSession } from '../context/SessionContext';

const dep = { key: 'department', label: 'Department' };
const Loading = ({ error }) => (error ? <div className="alert" role="alert">{error}</div> : <p className="muted">Loading…</p>);
const sem = { key: 'semester', label: 'Semester', type: 'number' };
const person = (meta) => [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'email', label: 'Email', type: 'email' }, { key: 'department', label: 'Department', options: meta.departments }];
const pwd = { key: 'password', label: 'Password', type: 'password', optional: true };

export function Students() {
  const { meta, error } = useMeta(); if (!meta) return <Loading error={error} />;
  return <ManagePage title="Students" noun="Student" resource="students" idKey="id" filterKey="department" filterOptions={meta.departments}
    columns={[{ key: 'id', label: 'Roll number' }, { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, dep, { key: 'course', label: 'Programme' }, { key: 'semester', label: 'Sem' }, { key: 'percentage', label: 'Attendance', render: (r) => (r.total ? `${r.percentage}%` : '—') }, { key: 'status', label: 'Status' }]}
    fields={[...person(meta).map((f) => (f.key === 'id' ? { ...f, label: 'Roll number' } : f)), { key: 'course', label: 'Programme (e.g. B.Sc Mathematics)', optional: true }, sem, { key: 'status', label: 'Status', options: ['Active', 'Inactive'] }, pwd]} />;
}
export function Faculty() {
  const { meta, error } = useMeta(); if (!meta) return <Loading error={error} />;
  return <ManagePage title="Faculty" noun="Faculty member" resource="faculty" idKey="id" filterKey="department" filterOptions={meta.departments}
    columns={[{ key: 'id', label: 'Faculty ID' }, { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, dep, { key: 'courses', label: 'Assigned courses' }, { key: 'status', label: 'Status' }]}
    fields={[...person(meta).map((f) => (f.key === 'id' ? { ...f, label: 'Faculty ID' } : f)), { key: 'status', label: 'Status', options: ['Active', 'Inactive'] }, pwd]} />;
}
export function Courses() {
  const { meta, error } = useMeta(); if (!meta) return <Loading error={error} />;
  return <ManagePage title="Courses" noun="Course" resource="courses" idKey="id" filterKey="department" filterOptions={meta.departments}
    columns={[{ key: 'id', label: 'Code' }, { key: 'name', label: 'Course name' }, dep, { key: 'faculty', label: 'Faculty' }, { key: 'semester', label: 'Sem' }, { key: 'students', label: 'Students' }]}
    fields={[{ key: 'id', label: 'Course code' }, { key: 'name', label: 'Course name' }, { key: 'department', label: 'Department', options: meta.departments }, { key: 'faculty', label: 'Faculty', options: meta.faculty.map((f) => f.name), allowEmpty: true }, sem]} />;
}

export function Enrollments() {
  const { meta, error } = useMeta(); const [course, setCourse] = useState(''), [data, setData] = useState(null), [pick, setPick] = useState(''), [msg, setMsg] = useState(''), [err, setErr] = useState('');
  useEffect(() => { if (meta && !course && meta.courses[0]) setCourse(meta.courses[0].code); }, [meta, course]);
  const load = useCallback(async () => { if (!course) return; try { const d = await http(`/enrollments/course/${encodeURIComponent(course)}`); setData(d); setPick(d.available[0]?.id || ''); setErr(''); } catch (e) { setErr(e.message); } }, [course]);
  useEffect(() => { load(); }, [load]);
  if (!meta) return <Loading error={error} />;
  const act = async (fn, ok) => { try { await fn(); setMsg(ok); await load(); } catch (e) { setErr(e.message); } };
  return (<>
    <h1 className="h1">Enrollments</h1>
    <div className="bar"><label className="fsel"><span>Course</span><select value={course} onChange={(e) => { setCourse(e.target.value); setMsg(''); }}>{meta.courses.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}</select></label>
      <span className="muted tight">Students are enrolled automatically when their department and semester match a course. Use this page for exceptions.</span></div>
    {msg && <div className="alert ok" role="status" style={{ marginBottom: 12 }}>{msg}</div>}{err && <div className="alert" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
    {data && <div className="two"><section><h2>Enrolled <small>{data.enrolled.length}</small></h2><div className="scroll"><table className="tbl"><thead><tr><th>Roll number</th><th>Name</th><th /></tr></thead><tbody>
      {data.enrolled.map((s) => <tr key={s.id}><td>{s.id}</td><td>{s.name}</td><td className="act"><button className="link danger" onClick={() => confirm(`Remove ${s.name} from ${course}?`) && act(() => del(`/enrollments/course/${encodeURIComponent(course)}/${encodeURIComponent(s.id)}`), `${s.name} removed.`)}>Remove</button></td></tr>)}
      {!data.enrolled.length && <tr><td colSpan="3" className="muted">No students are enrolled yet.</td></tr>}</tbody></table></div></section>
      <section><h2>Add a student</h2>{data.available.length ? <div className="stack"><label className="field"><span>Student</span><select value={pick} onChange={(e) => setPick(e.target.value)}>{data.available.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}</select></label>
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={!pick} onClick={() => act(() => post('/enrollments', { courseId: course, studentId: pick }), 'Student enrolled.')}>Enroll student</button></div> : <p className="muted">Every active student is already enrolled.</p>}</section></div>}
  </>);
}

export function Dashboard() {
  const { past, session, tick } = useSession(); const [tab, setTab] = useState('trends'), [d, setD] = useState(null), [err, setErr] = useState('');
  useEffect(() => { http('/admin/overview').then(setD).catch((e) => setErr(e.message)); }, [tick]);
  if (!d) return <Loading error={err} />;
  const live = [...(session ? [`Attendance session active — ${session.name} (${session.code})`] : []), ...past.slice(0, 2).map((p) => `Attendance session completed — ${p.name}, ${p.present}/${p.total} present`)];
  const M = [['Students', d.counts.students, Users], ['Faculty', d.counts.faculty, GraduationCap], ['Courses', d.counts.courses, BookOpen], [d.todayPct != null ? 'Today’s attendance' : 'Attendance, last 7 days', (d.todayPct ?? d.weekPct) != null ? `${d.todayPct ?? d.weekPct}%` : '—', Percent]];
  const feed = [...new Set([...live, ...d.activity])];
  return (<>
    <Hello note="Institution overview" />
    <div className="metrics">{M.map(([l, v, I]) => <div key={l}><i className="chip"><I size={18} /></i><b>{v}</b><span>{l}</span></div>)}</div>
    <Tabs value={tab} onChange={setTab} tabs={[['trends', 'Trends'], ['low', `Below ${d.threshold}%`, d.low.length], ['activity', 'Recent activity']]} />
    {tab === 'trends' && <div className="two"><section><h2>Recent attendance</h2>
      {d.trend.length ? <ResponsiveContainer width="100%" height={220}><LineChart data={d.trend}><XAxis dataKey="d" tickLine={false} axisLine={false} fontSize={12} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={12} width={36} unit="%" /><Tooltip formatter={(v) => `${v}%`} /><ReferenceLine y={d.threshold} stroke="var(--crit)" strokeDasharray="3 3" /><Line dataKey="pct" stroke="var(--chart)" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer> : <p className="muted">No attendance recorded yet.</p>}</section>
      <section><h2>By department</h2>{d.byDepartment.map(([n, v]) => <div className="hb" key={n}><span>{n}</span><i><u style={{ width: v + '%', background: v < d.threshold ? 'var(--crit)' : 'var(--accent)' }} /></i><b>{v}%</b></div>)}{!d.byDepartment.length && <p className="muted">No data yet.</p>}</section></div>}
    {tab === 'low' && <section className="panel"><div className="scroll"><table className="tbl"><thead><tr><th>Student</th><th>Roll number</th><th>Programme</th><th>Attendance</th><th>Attended / total</th><th>Status</th></tr></thead>
      <tbody>{d.low.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.id}</td><td>{s.course}</td><td className="crit">{s.percentage}%</td><td>{s.attended} / {s.total}</td><td style={{ color: s.percentage < d.threshold - 10 ? 'var(--crit)' : 'var(--warn)' }}>{s.percentage < d.threshold - 10 ? 'Critical' : 'Warning'}</td></tr>)}
        {!d.low.length && <tr><td colSpan="6" className="muted">No student is below {d.threshold}%.</td></tr>}</tbody></table></div></section>}
    {tab === 'activity' && <section className="panel"><ul className="feed">{feed.map((a) => <li key={a}>{a}</li>)}{!feed.length && <li className="muted">No activity yet.</li>}</ul></section>}
  </>);
}
