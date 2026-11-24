import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Bell, LogOut, LayoutDashboard, Users, GraduationCap, BookOpen, CalendarDays, ClipboardList, BarChart3, FileText, Settings, Radio, History, UserCircle, ScanLine, CalendarCheck, PenLine, ListChecks, Trophy, UserPlus } from 'lucide-react';
import Logo from './Logo';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { NAV, HOME } from '../config/nav';
const ICON = { dashboard: LayoutDashboard, students: Users, faculty: GraduationCap, courses: BookOpen, timetable: CalendarDays, attendance: ClipboardList, analytics: BarChart3, reports: FileText, notifications: Bell, settings: Settings, sessions: Radio, history: History, profile: UserCircle, scan: ScanLine, enrollments: UserPlus, quizzes: ListChecks, results: Trophy };
const iconFor = (role, to) => { const k = to.split('/').pop(); if (role === 'faculty' && k === 'dashboard') return CalendarCheck; if (role === 'faculty' && k === 'attendance') return PenLine; if (role === 'student' && k === 'attendance') return BookOpen; return ICON[k] || LayoutDashboard; };
const ROLE_LABEL = { admin: 'Administrator', faculty: 'Faculty', student: 'Student' };
export default function AppLayout() {
  const { user, logout, loginAs, demo } = useAuth(); const nav = useNavigate(); const loc = useLocation();
  const [open, setOpen] = useState(false);
  const unread = useNotifications().unread();
  const initials = user.name.split(' ').filter((w) => !w.endsWith('.')).map((w) => w[0]).slice(0, 2).join('');
  const title = NAV[user.role].find((n) => n.to === loc.pathname)?.label || (loc.pathname.endsWith('/qr') ? 'QR attendance' : '');
  useEffect(() => setOpen(false), [loc.pathname]);
  const switchRole = async (r) => { try { const u = await loginAs(r); nav(HOME[u.role]); } catch (e) { alert(e.message); } };
  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand"><Logo /></div>
        <nav aria-label="Primary">
          {NAV[user.role].map((n, i) => n.group
            ? <div key={i} className="navgroup">{n.group}</div>
            : <NavLink key={n.to} to={n.to} className="navlink">{(() => { const I = iconFor(user.role, n.to); return <I size={17} />; })()}{n.label}</NavLink>)}
        </nav>
        {demo && <div className="demo">
          <label htmlFor="rs">Demo: switch role</label>
          <select id="rs" value={user.role} onChange={(e) => switchRole(e.target.value)}>
            <option value="admin">Administrator</option><option value="faculty">Faculty</option><option value="student">Student</option>
          </select>
        </div>}
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="top">
          <button className="icon-btn menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? <X size={18} /> : <Menu size={18} />}</button>
          <div className="crumb">{title}</div><div className="grow" />
          <button className="icon-btn" aria-label={`Notifications, ${unread} unread`} onClick={() => nav(`/${user.role}/notifications`)}><Bell size={18} />{unread > 0 && <i className="dot">{unread}</i>}</button>
          <span className="av" aria-hidden="true">{initials}</span><div className="who"><strong>{user.name}</strong><span>{ROLE_LABEL[user.role]} · {user.id}</span></div>
          <button className="icon-btn" aria-label="Sign out" onClick={() => { logout(); nav('/login'); }}><LogOut size={18} /></button>
        </header>
        <main className="content" key={loc.pathname}><Outlet /></main>
      </div>
    </div>
  );
}
