import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { config } from './config.js';
import { pool, one, ensureDatabase, migrate } from './db.js';
import { initSettings } from './lib/settings.js';
import { setIo } from './lib/realtime.js';
import { verifyToken, errorHandler } from './lib/util.js';
import { seedIfEmpty } from './seed.js';
import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import sessionRoutes from './routes/sessions.js';
import insightRoutes from './routes/insights.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notifications.js';
import quizRoutes from './routes/quizzes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../frontend/dist');

async function main() {
  try { await ensureDatabase(); await migrate(); }
  catch (e) {
    console.error(`\n[db] Cannot reach PostgreSQL at ${config.databaseUrl.replace(/:[^:@/]*@/, ':****@')}\n     ${e.message}\n     Start PostgreSQL (docker compose up -d db) or fix DATABASE_URL in backend/.env\n`);
    process.exit(1);
  }
  await initSettings();
  await seedIfEmpty();

  const app = express();
  app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression());
  app.use(cors(config.corsOrigins.length ? { origin: config.corsOrigins } : { origin: true }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', async (_req, res) => {
    try { const r = await one('SELECT current_database() AS db, version() AS v'); res.json({ ok: true, service: 'Smart Attendance backend', database: r.db, postgres: r.v.split(' ').slice(0, 2).join(' '), demo: config.seedDemo, time: new Date().toISOString() }); }
    catch { res.status(503).json({ ok: false, message: 'Database unavailable' }); }
  });
  app.use('/api/auth', authRoutes);
  app.use('/api', settingsRoutes, sessionRoutes, insightRoutes, adminRoutes, notificationRoutes, quizRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ message: 'Endpoint not found.' }));

  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: config.corsOrigins.length ? config.corsOrigins : true } });
  io.use((s, next) => { try { s.user = verifyToken(s.handshake.auth.token); next(); } catch { next(new Error('unauthorized')); } });
  io.on('connection', async (s) => {
    const u = await one('SELECT code, role FROM users WHERE user_id = $1 AND status = $2', [s.user.uid, 'Active']).catch(() => null);
    if (!u) return s.disconnect(true);
    s.join(`user:${u.code}`); s.join(`role:${u.role}`); if (u.role !== 'student') s.join('staff');
  });
  setIo(io);

  server.listen(config.port, () => console.log(`\n  Smart Attendance API  →  http://localhost:${config.port}/api/health${fs.existsSync(dist) ? `\n  Web app (built)       →  http://localhost:${config.port}` : ''}\n`));
  const stop = async () => { io.close(); server.close(); await pool.end().catch(() => {}); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
main();
