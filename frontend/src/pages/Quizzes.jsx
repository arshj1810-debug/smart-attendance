import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Trash2, Upload, Download, Clock } from 'lucide-react';
import Tabs from '../components/Tabs';
import { http } from '../services/api';
import { parseCSV, toCSV, download } from '../utils/csv';
const when = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const post = (p, b) => http(p, { method: 'POST', body: JSON.stringify(b || {}) });
const blank = () => ({ text: '', options: ['', '', '', ''], correct: 0 });
const KEYS = ['question', 'optionA', 'optionB', 'optionC', 'optionD', 'correct'];
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function QuizManager() {
  const [tab, setTab] = useState('list'), [list, setList] = useState([]), [sel, setSel] = useState(null), [res, setRes] = useState(null), [msg, setMsg] = useState(''), [err, setErr] = useState('');
  const [courses, setCourses] = useState([]), [f, setF] = useState({ title: '', course: '', durationMin: 15, deadline: '', questions: [blank()] });
  useEffect(() => { http('/courses').then((r) => { setCourses(r.courses); setF((x) => ({ ...x, course: x.course || r.courses[0]?.code || '' })); }).catch((e) => setErr(e.message)); }, []);
  const load = useCallback(async () => { try { setList((await http('/quizzes/')).quizzes); } catch (e) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load]);
  const results = async (q) => { setSel(q); setRes(null); try { setRes(await http(`/quizzes/${q.id}/results/`)); } catch (e) { setErr(e.message); } };
  const setQ = (i, patch) => setF({ ...f, questions: f.questions.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setOpt = (i, k, v) => setQ(i, { options: f.questions[i].options.map((o, j) => (j === k ? v : o)) });
  const upload = async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    const { keys, rows } = parseCSV(await file.text()); const miss = KEYS.filter((k) => !keys.includes(k));
    if (miss.length) return setErr(`Missing columns: ${miss.join(', ')}. Use the template.`);
    const qs = rows.filter((r) => r.question).map((r) => ({ text: r.question, options: [r.optionA, r.optionB, r.optionC, r.optionD], correct: 'ABCD'.indexOf(r.correct.toUpperCase()) }));
    if (qs.some((x) => x.correct < 0)) return setErr('The correct column must be A, B, C or D on every row.');
    setErr(''); setF({ ...f, questions: [...f.questions.filter((x) => x.text || x.options.some(Boolean)), ...qs] }); setMsg(`${qs.length} questions imported.`);
  };
  const create = async (e) => {
    e.preventDefault(); setErr(''); setMsg(''); if (!f.deadline) return setErr('Choose a deadline.');
    const c = courses.find((x) => x.code === f.course); if (!c) return setErr('Choose a course. You need at least one assigned course to create a quiz.');
    try { await post('/quizzes/', { title: f.title, courseCode: c.code, courseName: c.name, durationMin: Number(f.durationMin), deadline: new Date(f.deadline).toISOString(), questions: f.questions }); setF({ ...f, title: '', questions: [blank()] }); setMsg('Quiz published. Students can see it now.'); setTab('list'); load(); } catch (x) { setErr(x.message); }
  };
  const remove = async (q) => { if (confirm(`Delete "${q.title}" and all its results?`)) { await http(`/quizzes/${q.id}/`, { method: 'DELETE' }); if (sel?.id === q.id) { setSel(null); setRes(null); } load(); } };
  const retake = async (r) => { await http(`/quizzes/${sel.id}/attempts/${r.studentId}/`, { method: 'DELETE' }); results(sel); load(); };
  return (<>
    <h1 className="h1">Quizzes &amp; results</h1>
    {msg && <div className="alert ok" role="status" style={{ marginBottom: 12 }}>{msg}</div>}{err && <div className="alert" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
    <Tabs value={tab} onChange={setTab} tabs={[['list', 'Quizzes', list.length], ['create', 'Create quiz']]} />
    {tab === 'list' && <>
      <section className="panel"><div className="scroll"><table className="tbl"><thead><tr><th>Quiz</th><th>Course</th><th>Questions</th><th>Time</th><th>Deadline</th><th>Submitted</th><th>Average</th><th /></tr></thead><tbody>
        {list.map((q) => <tr key={q.id} className={sel?.id === q.id ? 'rowsel' : ''}><td>{q.title}</td><td>{q.courseName}</td><td>{q.questionCount}</td><td>{q.durationMin} min</td><td>{when(q.deadline)}</td><td>{q.attempts}</td><td>{q.average == null ? '—' : q.average + '%'}</td>
          <td className="act"><button className="link" onClick={() => results(q)}>Results</button><button className="link danger" onClick={() => remove(q)}>Delete</button></td></tr>)}
        {!list.length && <tr><td colSpan="8" className="muted">No quizzes yet. Open “Create quiz” to publish one.</td></tr>}</tbody></table></div></section>
      {sel && <section className="panel" style={{ marginTop: 16 }}><div className="head"><h2 style={{ margin: 0 }}>{sel.title} · results {res && <small>{res.stats.attempts} submitted · avg {res.stats.average ?? '—'}{res.stats.average != null && '%'}</small>}</h2>
        {res && <button className="btn" onClick={() => download(`${sel.title.replace(/\W+/g, '_')}_results.csv`, toCSV(res.rows, ['studentId', 'name', 'status', 'score', 'total', 'percent']))}><Download size={16} />Export CSV</button>}</div>
        <div className="scroll"><table className="tbl"><thead><tr><th>Roll number</th><th>Student</th><th>Status</th><th>Score</th><th>%</th><th /></tr></thead><tbody>
          {res?.rows.map((r) => <tr key={r.studentId}><td>{r.studentId}</td><td>{r.name}</td><td>{r.status}</td><td>{r.score == null ? '—' : `${r.score} / ${r.total}`}</td><td className={r.percent != null && r.percent < 40 ? 'crit' : ''}>{r.percent == null ? '—' : r.percent + '%'}</td>
            <td className="act">{r.status !== 'Not attempted' && <button className="link" onClick={() => retake(r)}>Allow retake</button>}</td></tr>)}</tbody></table></div></section>}</>}
    {tab === 'create' && <form className="stack" onSubmit={create} style={{ maxWidth: 760 }}>
      <div className="two" style={{ gap: 12, margin: 0 }}>
        <label className="field"><span>Quiz title</span><input className="qin" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="field"><span>Assigned course</span><select className="qin" value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })}>{courses.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}</select></label>
        <label className="field"><span>Time limit (minutes)</span><input className="qin" type="number" min="1" max="180" required value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} /></label>
        <label className="field"><span>Deadline</span><input className="qin" type="datetime-local" required value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></label></div>
      <div className="gap wrap"><label className="btn"><Upload size={16} />Upload questions (CSV)<input type="file" accept=".csv" hidden onChange={upload} /></label>
        <button type="button" className="link" onClick={() => download('quiz-template.csv', toCSV([], KEYS))}>Template</button></div>
      {f.questions.map((q, i) => <div className="qcard" key={i}><div className="head" style={{ margin: 0 }}><b>Question {i + 1}</b>{f.questions.length > 1 && <button type="button" className="icon-btn" aria-label={`Remove question ${i + 1}`} onClick={() => setF({ ...f, questions: f.questions.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>}</div>
        <input className="qin" required placeholder="Question text" value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} />
        {q.options.map((o, k) => <label className="opt" key={k}><input type="radio" name={`c${i}`} checked={q.correct === k} onChange={() => setQ(i, { correct: k })} aria-label={`Option ${'ABCD'[k]} is correct`} /><input className="qin" required placeholder={`Option ${'ABCD'[k]}`} value={o} onChange={(e) => setOpt(i, k, e.target.value)} /></label>)}
        <span className="muted tight">Select the radio button next to the correct answer.</span></div>)}
      <div className="row"><button type="button" className="btn" onClick={() => setF({ ...f, questions: [...f.questions, blank()] })}><Plus size={16} />Add question</button><button className="btn primary">Publish quiz</button></div></form>}
  </>);
}

export function StudentQuizzes() {
  const [list, setList] = useState([]), [tab, setTab] = useState('open'), [err, setErr] = useState('');
  useEffect(() => { http('/quizzes/').then((r) => setList(r.quizzes)).catch((e) => setErr(e.message)); }, []);
  const open = list.filter((q) => q.status === 'available' || q.status === 'in_progress'), done = list.filter((q) => q.status === 'completed' || q.status === 'closed');
  const rows = tab === 'open' ? open : done;
  return (<>
    <h1 className="h1">Quizzes</h1>{err && <div className="alert" role="alert">{err}</div>}
    <Tabs value={tab} onChange={setTab} tabs={[['open', 'Available', open.length], ['done', 'Completed & closed', done.length]]} />
    <section className="panel"><div className="scroll"><table className="tbl"><thead><tr><th>Quiz</th><th>Course</th><th>Questions</th><th>Time</th><th>Deadline</th><th>Status</th><th /></tr></thead><tbody>
      {rows.map((q) => <tr key={q.id}><td>{q.title}</td><td>{q.courseName}</td><td>{q.total}</td><td>{q.durationMin} min</td><td>{when(q.deadline)}</td>
        <td style={{ color: q.status === 'completed' ? 'var(--ok)' : q.status === 'closed' ? 'var(--crit)' : undefined }}>{{ available: 'Available', in_progress: 'In progress', completed: `Score ${q.score}/${q.total}`, closed: 'Missed' }[q.status]}</td>
        <td className="act">{(q.status === 'available' || q.status === 'in_progress') && <Link className="btn primary" to={`/student/quizzes/${q.id}`}>{q.status === 'available' ? 'Start' : 'Resume'}</Link>}{q.status === 'completed' && <Link className="link" to="/student/results">View result</Link>}</td></tr>)}
      {!rows.length && <tr><td colSpan="7" className="muted">{tab === 'open' ? 'No quizzes are open right now.' : 'Nothing here yet.'}</td></tr>}</tbody></table></div></section></>);
}

export function QuizTake() {
  const { id } = useParams(); const [info, setInfo] = useState(null), [run, setRun] = useState(null), [ans, setAns] = useState([]), [idx, setIdx] = useState(0), [left, setLeft] = useState(0), [result, setResult] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), sub = useRef(false);
  useEffect(() => { http('/quizzes/').then((r) => setInfo(r.quizzes.find((q) => q.id === id) || false)).catch((e) => setErr(e.message)); }, [id]);
  const n = run?.quiz.questionCount || 0, full = (a) => Array.from({ length: n }, (_, i) => a[i] ?? null);
  const begin = async () => { setBusy(true); setErr(''); try { const r = await post(`/quizzes/${id}/start/`); setRun(r); setAns(r.answers || []); setIdx(0); } catch (e) { setErr(e.message); } setBusy(false); };
  const finish = async () => { if (sub.current || !run) return; sub.current = true; setBusy(true); try { setResult(await post(`/quizzes/${id}/submit/`, { answers: full(ans) })); } catch (e) { setErr(e.message); sub.current = false; } setBusy(false); };
  const fin = useRef(finish); fin.current = finish;
  useEffect(() => {
    if (!run || result) return; const tick = () => { const l = Math.max(0, Math.round((run.endsAt - Date.now()) / 1000)); setLeft(l); if (l === 0) fin.current(); };
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, [run, result]);
  const pick = (qi, oi) => { const a = [...ans]; a[qi] = oi; setAns(a); post(`/quizzes/${id}/answers/`, { answers: full(a) }).catch(() => {}); };
  const submit = () => { const un = n - ans.filter((x) => x != null).length; if (un && !window.confirm(`${un} question${un > 1 ? 's are' : ' is'} unanswered. Submit anyway?`)) return; finish(); };
  if (err && !run && !result) return <><h1 className="h1">Quiz</h1><div className="alert" role="alert">{err}</div><p><Link to="/student/quizzes" className="link">Back to quizzes</Link></p></>;
  if (info === false) return <><h1 className="h1">Quiz</h1><p className="muted">This quiz was not found. <Link to="/student/quizzes" className="link">Back to quizzes</Link></p></>;
  if (result) return (<><h1 className="h1">Result</h1>
    <div className="metrics"><div><b>{result.score}/{result.total}</b><span>Score</span></div><div><b style={{ color: result.percent < 40 ? 'var(--crit)' : 'var(--ok)' }}>{result.percent}%</b><span>Percentage</span></div></div>
    {result.timedOut && <div className="alert warn" style={{ marginBottom: 12 }}>Time ran out. Only the answers saved before the timer ended were counted.</div>}
    {result.review.map((r, i) => <section className="panel" key={i} style={{ marginBottom: 12 }}><b>{i + 1}. {r.text}</b>{r.options.map((o, k) => <div key={k} className={`choice ${k === r.correct ? 'right' : k === r.chosen ? 'wrong' : ''}`} style={{ marginTop: 8, cursor: 'default' }}>{'ABCD'[k]}. {o}{k === r.correct && ' ✓'}{k === r.chosen && k !== r.correct && ' (your answer)'}</div>)}{r.chosen == null && <p className="muted tight">Not answered.</p>}</section>)}
    <p><Link to="/student/results" className="link">All results</Link> · <Link to="/student/quizzes" className="link">Back to quizzes</Link></p></>);
  if (!run) return (<><h1 className="h1">{info?.title || 'Quiz'}</h1>{info && <><p className="muted">{info.courseName} · {info.total} questions · {info.durationMin} minutes · due {when(info.deadline)}</p>
    <section className="panel" style={{ maxWidth: 520 }}><p style={{ marginTop: 0 }}>The timer starts when you press Start and keeps running if you leave the page. Your answers are saved as you go, and the quiz submits automatically when time is up.</p>
      {err && <div className="alert" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {info.status === 'available' || info.status === 'in_progress' ? <button className="btn primary" disabled={busy} onClick={begin}>{info.status === 'in_progress' ? 'Resume quiz' : 'Start quiz'}</button> : <p className="muted" style={{ margin: 0 }}>This quiz is {info.status === 'completed' ? 'already submitted' : 'closed'}.</p>}</section></>}</>);
  const q = run.quiz.questions[idx];
  return (<>
    <div className="head"><h1 className="h1" style={{ margin: 0 }}>{run.quiz.title}</h1><span className="pill timer" style={{ color: left < 60 ? 'var(--crit)' : undefined }}><Clock size={13} style={{ verticalAlign: -2 }} /> {mmss(left)}</span></div>
    {err && <div className="alert" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
    <section className="panel" style={{ maxWidth: 720 }}><p className="muted tight" style={{ margin: '0 0 6px' }}>Question {idx + 1} of {n}</p><h2 style={{ fontSize: 18 }}>{q.text}</h2>
      {q.options.map((o, k) => <label key={k} className={`choice ${ans[idx] === k ? 'on' : ''}`} style={{ marginTop: 8 }}><input type="radio" name="opt" checked={ans[idx] === k} onChange={() => pick(idx, k)} />{o}</label>)}
      <div className="row" style={{ marginTop: 18 }}><button className="btn" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Previous</button>{idx < n - 1 ? <button className="btn primary" onClick={() => setIdx(idx + 1)}>Next</button> : <button className="btn primary" disabled={busy} onClick={submit}>Submit quiz</button>}</div></section>
    <div className="qnav">{Array.from({ length: n }, (_, i) => <button key={i} className={`${i === idx ? 'cur' : ''} ${ans[i] != null ? 'done' : ''}`} onClick={() => setIdx(i)} aria-label={`Question ${i + 1}${ans[i] != null ? ', answered' : ''}`}>{i + 1}</button>)}<button className="btn primary" style={{ marginLeft: 'auto' }} disabled={busy} onClick={submit}>Submit</button></div>
  </>);
}

export function StudentResults() {
  const [rs, setRs] = useState([]), [err, setErr] = useState('');
  useEffect(() => { http('/results/me/').then((r) => setRs(r.results)).catch((e) => setErr(e.message)); }, []);
  const avg = rs.length ? Math.round(rs.reduce((a, r) => a + r.percent, 0) / rs.length) : null, best = rs.length ? Math.max(...rs.map((r) => r.percent)) : null;
  return (<>
    <h1 className="h1">Results</h1>{err && <div className="alert" role="alert">{err}</div>}
    <div className="metrics"><div><b>{rs.length}</b><span>Quizzes taken</span></div><div><b>{avg == null ? '—' : avg + '%'}</b><span>Average score</span></div><div><b>{best == null ? '—' : best + '%'}</b><span>Best score</span></div></div>
    {rs.length > 0 && <section className="panel" style={{ marginBottom: 16 }}><h2>Performance history</h2>{[...rs].reverse().map((r) => <div className="hb" key={r.quizId} style={{ gridTemplateColumns: '170px 1fr 44px' }}><span>{r.title}</span><i><u style={{ width: r.percent + '%', background: r.percent < 40 ? 'var(--crit)' : 'var(--accent)' }} /></i><b>{r.percent}%</b></div>)}</section>}
    <section className="panel"><div className="scroll"><table className="tbl"><thead><tr><th>Quiz</th><th>Course</th><th>Score</th><th>%</th><th>Submitted</th></tr></thead><tbody>
      {rs.map((r) => <tr key={r.quizId}><td>{r.title}{r.timedOut && <span className="muted tight"> · timed out</span>}</td><td>{r.courseName}</td><td>{r.score} / {r.total}</td><td className={r.percent < 40 ? 'crit' : ''}>{r.percent}%</td><td>{when(r.submittedAt)}</td></tr>)}
      {!rs.length && <tr><td colSpan="5" className="muted">No results yet. Take a quiz from <Link to="/student/quizzes" className="link">Quizzes</Link>.</td></tr>}</tbody></table></div></section></>);
}
