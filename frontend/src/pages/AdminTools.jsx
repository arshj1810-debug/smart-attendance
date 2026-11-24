import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import ManagePage from '../components/ManagePage';
import { useMeta } from '../services/meta';
import { http } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSession } from '../context/SessionContext';
import { parseCSV, toCSV, download } from '../utils/csv';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const Loading = ({ error }) => (error ? <div className="alert" role="alert">{error}</div> : <p className="muted">Loading…</p>);

export function Timetable() {
  const { meta, error } = useMeta(); if (!meta) return <Loading error={error} />;
  const courses = meta.courses.map((c) => `${c.code} · ${c.name}`);
  return <ManagePage title="Timetable" noun="Class slot" resource="timetable" idKey="id" filterKey="day" filterOptions={DAYS}
    columns={[{ key: 'day', label: 'Day' }, { key: 'time', label: 'Time' }, { key: 'course', label: 'Course' }, { key: 'faculty', label: 'Faculty' }, { key: 'room', label: 'Room' }]}
    fields={[{ key: 'day', label: 'Day', options: DAYS }, { key: 'time', label: 'Time (e.g. 09:00–09:50)' }, { key: 'course', label: 'Course', options: courses }, { key: 'room', label: 'Room', optional: true }]} />;
}

export function Records() {
  const { meta, error } = useMeta(); if (!meta) return <Loading error={error} />;
  return <ManagePage title="Attendance records" noun="Record" resource="records" idKey="id" filterKey="course" filterOptions={[...new Set(meta.courses.map((c) => c.name))]} allowAdd={false} allowDelete={false} allowImport={false}
    columns={[{ key: 'date', label: 'Date' }, { key: 'roll', label: 'Roll number' }, { key: 'name', label: 'Student' }, { key: 'course', label: 'Course' }, { key: 'status', label: 'Status' }]}
    fields={[{ key: 'status', label: 'Status', options: ['Present', 'Absent', 'Late'] }]} />;
}

const Bars = ({ data, th }) => data.map(([n, v]) => <div className="hb" key={n}><span>{n}</span><i><u style={{ width: v + '%', background: v < th ? 'var(--crit)' : 'var(--accent)' }} /></i><b>{v}%</b></div>);
const Sel = ({ label, value, onChange, opts }) => <label className="fsel"><span>{label}</span><select value={value} onChange={onChange}><option value="">All</option>{opts.map((o) => <option key={o}>{o}</option>)}</select></label>;
const Chart = ({ data, th }) => (data.length ? <ResponsiveContainer width="100%" height={200}><LineChart data={data}><XAxis dataKey="d" tickLine={false} axisLine={false} fontSize={12} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={12} width={36} unit="%" /><Tooltip formatter={(v) => `${v}%`} /><ReferenceLine y={th} stroke="var(--crit)" strokeDasharray="3 3" /><Line dataKey="pct" stroke="var(--chart)" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer> : <p className="muted">No attendance in this period.</p>);

export function Analytics({ hideFaculty }) {
  const { user } = useAuth(); const { tick } = useSession(); const { meta, error } = useMeta();
  const [f, setF] = useState({ range: '6', dept: '', course: '', faculty: '', sem: '' }), [d, setD] = useState(null), [err, setErr] = useState(''), [mine, setMine] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useEffect(() => { if (user.role === 'faculty') http('/courses').then((r) => setMine(r.courses)).catch(() => {}); }, [user.role]);
  useEffect(() => {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    http(`/analytics/overview?${qs}`).then((r) => { setD(r); setErr(''); }).catch((e) => setErr(e.message));
  }, [f, tick]);
  if (!meta) return <Loading error={error} />;
  const courseNames = [...new Set((user.role === 'faculty' && mine ? mine : meta.courses).map((c) => c.name))], th = d?.threshold ?? 75;
  return (<>
    <h1 className="h1">Analytics</h1>
    <div className="filters"><label className="fsel"><span>Date range</span><select value={f.range} onChange={set('range')}><option value="1">This month</option><option value="3">Last 3 months</option><option value="6">Semester (6 months)</option></select></label>
      <Sel label="Department" value={f.dept} onChange={set('dept')} opts={meta.departments} /><Sel label="Course" value={f.course} onChange={set('course')} opts={courseNames} />
      {!hideFaculty && <Sel label="Faculty" value={f.faculty} onChange={set('faculty')} opts={meta.faculty.map((x) => x.name)} />}<Sel label="Semester" value={f.sem} onChange={set('sem')} opts={meta.semesters.map(String)} /></div>
    {err && <div className="alert" role="alert">{err}</div>}
    {d && (!d.total ? <p className="muted">No attendance has been recorded for these filters. Clear a filter to see data.</p> : <>
      <div className="metrics"><div><b>{d.avg}%</b><span>Average attendance</span></div><div><b>{d.students}</b><span>Students in view</span></div><div><b>{d.below}</b><span>Below {th}%</span></div></div>
      <div className="two"><section><h2>Recent days</h2><Chart data={d.weekly} th={th} /></section><section><h2>Monthly trend</h2><Chart data={d.monthly} th={th} /></section></div>
      <div className="two"><section><h2>By course</h2><Bars data={d.byCourse} th={th} /></section><section><h2>By department</h2><Bars data={d.byDept} th={th} /></section></div>
      <section><h2>Present vs absent</h2><div className="split"><u style={{ width: d.avg + '%' }} /></div><p className="muted tight">{d.attended} classes attended · {d.total - d.attended} missed · {d.total} total entries across {d.students} students</p></section></>)}
  </>);
}

const TYPES = ['Student-wise', 'Course-wise', 'Department-wise', 'Low attendance'];
export function Reports() {
  const { meta } = useMeta();
  const [type, setType] = useState('Student-wise'), [dept, setDept] = useState(''), [list, setList] = useState([]), [sel, setSel] = useState(null), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const add = (r) => { const x = { id: Date.now(), created: new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), ...r }; setList((p) => [x, ...p]); setSel(x.id); setMsg(''); };
  const gen = async () => { setBusy(true); try { const r = await http(`/reports?type=${encodeURIComponent(type)}&dept=${encodeURIComponent(dept)}`); add({ name: `${type}${dept ? ' · ' + dept : ''}`, ...r }); } catch (e) { setMsg(e.message); } setBusy(false); };
  const up = async (e) => { const file = e.target.files[0]; e.target.value = ''; if (!file) return; const { keys, rows } = parseCSV(await file.text()); if (!keys.length || !rows.length) return setMsg('That file has no rows. Use a CSV with a header row.'); add({ name: file.name, keys, rows }); };
  const cur = list.find((x) => x.id === sel);
  return (<>
    <h1 className="h1">Reports</h1>{msg && <div className="alert" role="alert">{msg}</div>}
    <div className="bar"><label className="fsel"><span>Report</span><select value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label className="fsel"><span>Department</span><select value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All</option>{(meta?.departments || []).map((d) => <option key={d}>{d}</option>)}</select></label>
      <button className="btn primary" disabled={busy} onClick={gen}>{busy ? 'Generating…' : 'Generate report'}</button><label className="btn">Upload CSV report<input type="file" accept=".csv" hidden onChange={up} /></label></div>
    <div className="two"><section><h2>Saved reports <small>{list.length}</small></h2><ul className="feed">{list.map((x) => <li key={x.id}><button className={`link ${sel === x.id ? 'strong' : ''}`} onClick={() => setSel(x.id)}>{x.name}</button> <span className="muted tight">· {x.created}</span></li>)}{!list.length && <li className="muted">Generate or upload a report to see it here.</li>}</ul></section>
      <section>{cur && <><div className="head"><h2>{cur.name}</h2><div className="gap"><button className="btn" onClick={() => download(cur.name.replace(/[^\w]+/g, '_') + '.csv', toCSV(cur.rows, cur.keys))}>Export CSV</button><button className="btn" onClick={() => window.print()}>Print / save PDF</button><button className="btn" onClick={() => { setList(list.filter((x) => x.id !== cur.id)); setSel(null); }}>Delete</button></div></div>
        <div className="scroll"><table className="tbl"><thead><tr>{cur.keys.map((k) => <th key={k}>{k}</th>)}</tr></thead><tbody>{cur.rows.slice(0, 50).map((r, i) => <tr key={i}>{cur.keys.map((k) => <td key={k}>{r[k]}</td>)}</tr>)}{!cur.rows.length && <tr><td colSpan={cur.keys.length} className="muted">No rows match this report.</td></tr>}</tbody></table></div>{cur.rows.length > 50 && <p className="muted tight">Showing 50 of {cur.rows.length} rows. Export for the full report.</p>}</>}</section></div>
  </>);
}
