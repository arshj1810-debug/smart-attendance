import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { http } from '../services/api';
export default function FacultyCourses() {
  const [courses, setCourses] = useState(null), [sel, setSel] = useState(null), [rep, setRep] = useState(null), [err, setErr] = useState('');
  useEffect(() => { http('/faculty/courses').then((r) => { setCourses(r.courses); setSel(r.courses[0] || null); }).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { if (!sel) return setRep(null); setRep(null); http(`/attendance/course/${sel.courseId}/report`).then(setRep).catch((e) => setErr(e.message)); }, [sel]);
  if (!courses) return err ? <div className="alert" role="alert">{err}</div> : <p className="muted">Loading…</p>;
  const th = rep?.threshold ?? 75;
  return (<>
    <h1 className="h1">My courses</h1>{err && <div className="alert" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
    <div className="scroll"><table className="tbl"><thead><tr><th>Code</th><th>Course</th><th>Enrolled</th><th>Avg attendance</th></tr></thead><tbody>
      {courses.map((c) => <tr key={c.code} className={sel?.code === c.code ? 'rowsel' : ''}><td>{c.code}</td><td><button className="link strong" onClick={() => setSel(c)}>{c.name}</button></td><td>{c.enrolled}</td><td style={{ color: c.average < th ? 'var(--crit)' : undefined }}>{c.average}%</td></tr>)}
      {!courses.length && <tr><td colSpan="4" className="muted">No courses are assigned to you yet.</td></tr>}</tbody></table></div>
    {sel && <section style={{ marginTop: 28 }}><div className="head"><h2 style={{ margin: 0 }}>{sel.name} · enrolled students {rep && <small>avg {rep.average}% · {rep.sessions_held} sessions held</small>}</h2><Link className="link" to="/faculty/dashboard">Start attendance from Today</Link></div>
      <div className="scroll"><table className="tbl"><thead><tr><th>Roll number</th><th>Name</th><th>Present / Late / Absent</th><th>Attended / total</th><th>%</th></tr></thead><tbody>
        {rep?.students.map((s) => <tr key={s.id}><td>{s.id}</td><td>{s.name}</td><td>{s.present_count} / {s.late_count} / {s.absent_count}</td><td>{s.attended} / {s.total}</td><td className={s.low_attendance ? 'crit' : ''}>{s.total ? `${s.percentage}%` : '—'}</td></tr>)}
        {rep && !rep.students.length && <tr><td colSpan="5" className="muted">No students are enrolled in this course.</td></tr>}{!rep && <tr><td colSpan="5" className="muted">Loading…</td></tr>}</tbody></table></div></section>}
  </>);
}
