import { useState } from 'react';
import { AlertTriangle, Megaphone, CalendarDays, CheckCircle2 } from 'lucide-react';
import { useMy } from './Student';
import AcademicAlerts from '../components/AcademicAlerts';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
const TI = { Alert: AlertTriangle, Announcement: Megaphone, Session: CalendarDays, Update: CheckCircle2 };
const AUD = { all: 'Everyone', faculty: 'Faculty', student: 'Students', admin: 'Admins' };
export default function Notifications() {
  const { user } = useAuth(); const role = user.role; const N = useNotifications(); const list = N.visible(); const { subjects, threshold } = useMy();
  const [f, setF] = useState({ title: '', body: '', audience: 'all', type: 'Announcement' }); const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const send = async (e) => { e.preventDefault(); try { await N.send(f); setMsg(`Sent to ${AUD[f.audience].toLowerCase()}.`); setF({ ...f, title: '', body: '' }); } catch (x) { setMsg(x.message); } };
  return (<>
    <div className="head"><h1 className="h1">Notifications</h1>{N.unread() > 0 && <button className="btn" onClick={() => N.markAll()}>Mark all as read</button>}</div>
    {role === 'admin' && <section><h2>Send an announcement or alert</h2>
      <form className="compose" onSubmit={send}>
        <label className="field"><span>Title</span><input required value={f.title} onChange={set('title')} /></label>
        <label className="field"><span>Message</span><textarea required rows="3" value={f.body} onChange={set('body')} /></label>
        <div className="gap"><label className="field"><span>Send to</span><select value={f.audience} onChange={set('audience')}><option value="all">Everyone</option><option value="faculty">Faculty</option><option value="student">Students</option></select></label>
          <label className="field"><span>Type</span><select value={f.type} onChange={set('type')}><option>Announcement</option><option>Alert</option></select></label></div>
        <div className="row"><span className="muted tight" role="status">{msg}</span><button className="btn primary">Send</button></div></form></section>}
    {role === 'student' && <AcademicAlerts subjects={subjects} threshold={threshold} />}
    <section><h2>{role === 'admin' ? 'All notifications' : 'Inbox'} <small>{N.unread()} unread</small></h2>
      <ul className="notes">{list.map((n) => { const un = !n.read; return (
        <li key={n.id} className={un ? 'unread' : ''}><span className="chip sm">{(() => { const I = TI[n.type] || Megaphone; return <I size={16} />; })()}</span><div className="grow"><b>{n.title}</b><p>{n.body}</p><span className="muted tight">{n.type} · {role === 'admin' ? AUD[n.audience] + ' · ' : ''}{n.date}</span></div>
          <div className="gap">{un && <button className="link" onClick={() => N.markRead(n.id)}>Mark as read</button>}{role === 'admin' && <button className="link danger" onClick={() => N.remove(n.id)}>Delete</button>}</div></li>); })}
        {!list.length && <li className="muted">Nothing here yet.</li>}</ul></section>
  </>);
}
