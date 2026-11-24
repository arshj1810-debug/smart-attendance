import { http } from './api';
export const authService = {
  // POST /api/auth/login -> { user, accessToken, refreshToken }
  login: (email, password) => http('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  demo: (role) => http('/auth/demo', { method: 'POST', body: JSON.stringify({ role }) }),
  me: () => http('/auth/me'),
};
