import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { http, post, del } from '../services/api';
import { getSocket } from '../services/socket';
import { useAuth } from './AuthContext';
const Ctx = createContext(null);
export const useNotifications = () => useContext(Ctx);

// Notifications are stored on the server; a Socket.IO event tells every open tab to reload them.
export function NotificationProvider({ children }) {
  const { user } = useAuth(); const uid = user?.id;
  const [items, setItems] = useState([]);
  const load = useCallback(async () => { if (!uid) return setItems([]); try { setItems((await http('/notifications')).notifications); } catch { /* keep last */ } }, [uid]);
  useEffect(() => {
    load(); const s = getSocket(uid); if (!s) return;
    s.on('notification:new', load); s.on('connect', load);
    const t = setInterval(load, 60000);
    return () => { s.off('notification:new', load); s.off('connect', load); clearInterval(t); };
  }, [uid, load]);
  const visible = () => items;
  const unread = () => items.filter((n) => !n.read).length;
  const markRead = async (id) => { setItems((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n))); try { await post(`/notifications/${id}/read`); } catch { load(); } };
  const markAll = async () => { setItems((p) => p.map((n) => ({ ...n, read: true }))); try { await post('/notifications/read-all'); } catch { load(); } };
  const remove = async (id) => { setItems((p) => p.filter((n) => n.id !== id)); try { await del(`/notifications/${id}`); } catch { load(); } };
  const send = async (n) => { await post('/notifications', n); await load(); };
  return <Ctx.Provider value={{ visible, unread, markRead, markAll, remove, send, reload: load }}>{children}</Ctx.Provider>;
}
