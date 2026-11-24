import { io } from 'socket.io-client';
import { getToken } from './api';
let sock = null, owner = null;
// One shared Socket.IO connection per signed-in user.
export function getSocket(userId) {
  if (!userId || !getToken()) return null;
  if (sock && owner === userId) return sock;
  sock?.disconnect(); owner = userId; sock = io({ auth: { token: getToken() }, reconnectionDelayMax: 5000 });
  return sock;
}
export function closeSocket() { sock?.disconnect(); sock = null; owner = null; }
