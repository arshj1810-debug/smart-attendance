import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { http, post } from '../services/api';
import { getSocket } from '../services/socket';
import { useAuth } from './AuthContext';
const Ctx = createContext(null);
export const useSession = () => useContext(Ctx);

// Live attendance session state, kept in sync with the server and with Socket.IO events.
export function SessionProvider({ children }) {
  const { user } = useAuth();
  const [session, setSession] = useState(null), [marks, setMarks] = useState({}), [past, setPast] = useState([]), [scans, setScans] = useState([]);
  const [loaded, setLoaded] = useState(false), [tick, setTick] = useState(0), [error, setError] = useState('');
  const uid = user?.id, role = user?.role;
  const refresh = useCallback(async () => {
    if (!uid) { setSession(null); setMarks({}); setPast([]); setScans([]); setLoaded(true); return; }
    try {
      const { session: s } = await http('/sessions/active'); setSession(s); setMarks(s?.marks || {});
      if (role === 'student') setScans((await http('/attendance/me')).records.map((r) => ({ ...r, studentId: uid })));
      else setPast((await http('/sessions/past')).sessions);
      setTick((t) => t + 1);
    } catch { /* server unreachable: keep the last known state */ }
    setLoaded(true);
  }, [uid, role]);
  const timer = useRef(null), refreshSoon = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(refresh, 150); }, [refresh]);
  useEffect(() => {
    refresh(); const s = getSocket(uid); if (!s) return;
    ['session:changed', 'attendance:update', 'attendance:changed'].forEach((e) => s.on(e, refreshSoon));
    s.on('connect', refreshSoon);
    return () => { ['session:changed', 'attendance:update', 'attendance:changed', 'connect'].forEach((e) => s.off(e, e === 'connect' ? refreshSoon : refreshSoon)); clearTimeout(timer.current); };
  }, [uid, refresh, refreshSoon]);

  const push = (sid, m) => post('/attendance/mark', { sessionId: sid, records: Object.entries(m).map(([studentId, status]) => ({ studentId, status })) }).then(refresh);
  const safe = (p) => p.catch((e) => { setError(e.message); return refresh(); });
  const all = (v) => Object.fromEntries(Object.keys(marks).map((k) => [k, v]));
  const value = {
    session, marks, past, scans, loaded, error, clearError: () => setError(''), tick, refresh,
    count: (x) => Object.values(marks).filter((v) => v === x).length,
    start: async (cls) => { const s = await post('/sessions/create', { code: cls.code, name: cls.name, room: cls.room, time: cls.time }); setSession(s); setMarks(s.marks); setTick((t) => t + 1); },
    end: async () => { if (session) { await post(`/sessions/${session.id}/end`); await refresh(); } },
    setMark: (id, v) => { setError(''); setMarks((m) => ({ ...m, [id]: v })); return safe(push(session.id, { [id]: v })); },
    setAll: (v) => { setError(''); setMarks(all(v)); return safe(push(session.id, all(v))); },
    reset: () => { setMarks(all('Absent')); return safe(push(session.id, all('Absent'))); },
    updatePast: (id, m) => push(id, m),
    submitScan: async (_id, raw, geo = {}) => { try { const r = await post('/attendance/scan', { token: raw, ...geo }); await refresh(); return r; } catch (e) { return { ok: false, message: e.message }; } },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
