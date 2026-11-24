const KEY = 'theme';
export const getTheme = () => { try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; } };
const resolve = (m) => (m === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : m);
export const applyTheme = (m = getTheme()) => { document.documentElement.dataset.theme = resolve(m); };
export const setTheme = (m) => { try { localStorage.setItem(KEY, m); } catch { /* storage unavailable */ } applyTheme(m); };
export function watchSystem() {
  const q = matchMedia('(prefers-color-scheme: dark)'); const f = () => { if (getTheme() === 'system') applyTheme(); };
  q.addEventListener('change', f); return () => q.removeEventListener('change', f);
}
