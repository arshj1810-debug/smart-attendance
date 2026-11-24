import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authService } from '../services/authService';
import { closeSocket } from '../services/socket';
const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);
const read = () => { try { return JSON.parse(sessionStorage.getItem('session') || localStorage.getItem('session')); } catch { return null; } };
export function AuthProvider({ children }) {
  const [session, setSession] = useState(read), [demo, setDemo] = useState(false);
  const save = (data) => { const store = sessionStorage.getItem('session') ? sessionStorage : localStorage; store.setItem('session', JSON.stringify(data)); };
  const start = useCallback((data, remember) => {
    closeSocket(); sessionStorage.clear(); localStorage.removeItem('session'); localStorage.removeItem('accessToken');
    const store = remember ? localStorage : sessionStorage;
    store.setItem('session', JSON.stringify(data)); store.setItem('accessToken', data.accessToken);
    setSession(data);
  }, []);
  useEffect(() => { fetch('/api/health').then((r) => r.json()).then((d) => setDemo(!!d.demo)).catch(() => {}); }, []);
  // Re-validate a stored session on load so a deleted/deactivated account is signed out.
  useEffect(() => { if (session) authService.me().then((d) => { const next = { ...session, user: d.user }; save(next); setSession(next); }).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const login = async (email, password, remember) => { const d = await authService.login(email, password); start(d, remember); return d.user; };
  const loginAs = async (role) => { const d = await authService.demo(role); start(d, false); return d.user; };
  const logout = () => { closeSocket(); sessionStorage.clear(); localStorage.removeItem('session'); localStorage.removeItem('accessToken'); setSession(null); };
  const updateUser = (user) => { const next = { ...session, user }; save(next); setSession(next); };
  return <Ctx.Provider value={{ user: session?.user ?? null, demo, login, loginAs, logout, updateUser }}>{children}</Ctx.Provider>;
}
