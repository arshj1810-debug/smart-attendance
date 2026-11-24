// Thin fetch wrapper: adds the JWT, refreshes it once on 401, and turns failures into readable errors.
const readSession = () => { try { return JSON.parse(sessionStorage.getItem('session') || localStorage.getItem('session')); } catch { return null; } };
const activeStore = () => (sessionStorage.getItem('session') ? sessionStorage : localStorage);
export const getToken = () => sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken');

let refreshing = null;
async function refresh() {
  const s = readSession(); if (!s?.refreshToken) throw new Error('no refresh token');
  const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) });
  if (!res.ok) throw new Error('refresh failed');
  const d = await res.json(); const st = activeStore();
  st.setItem('accessToken', d.accessToken); st.setItem('session', JSON.stringify({ ...s, accessToken: d.accessToken }));
}
function expire() {
  sessionStorage.clear(); localStorage.removeItem('session'); localStorage.removeItem('accessToken');
  if (location.pathname !== '/login') location.assign('/login');
}

export const http = async (path, options = {}, retry = true) => {
  const token = getToken(); let res;
  try {
    res = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...options.headers } });
  } catch { throw new Error('Cannot reach the server. Check that the backend is running.'); }
  if (res.status === 401 && retry && !path.startsWith('/auth/login') && !path.startsWith('/auth/demo') && readSession()?.refreshToken) {
    try { refreshing = refreshing || refresh().finally(() => { refreshing = null; }); await refreshing; return http(path, options, false); } catch { expire(); throw new Error('Your session has expired. Please sign in again.'); }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
};
export const post = (path, body) => http(path, { method: 'POST', body: JSON.stringify(body || {}) });
export const put = (path, body) => http(path, { method: 'PUT', body: JSON.stringify(body || {}) });
export const del = (path) => http(path, { method: 'DELETE' });
