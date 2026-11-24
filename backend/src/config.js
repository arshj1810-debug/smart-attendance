import 'dotenv/config';
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
export const config = {
  port: Number(process.env.PORT) || 3200,
  env: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5433/smart_attendance',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  qrSecret: process.env.QR_SECRET || 'dev-only-qr-secret-change-me',
  seedDemo: bool(process.env.SEED_DEMO, true),
  selfRegistration: bool(process.env.ALLOW_SELF_REGISTRATION, false),
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  qrTtlMs: 2000,
  qrGraceMs: 1500,
  editWindowMs: 24 * 3600000,
  defaultPassword: 'Welcome@123',
};
config.isProd = config.env === 'production';
if (config.isProd && (config.jwtSecret.startsWith('dev-only') || config.jwtSecret.startsWith('change-me'))) {
  console.warn('[security] JWT_SECRET is not set to a strong value. Set JWT_SECRET and QR_SECRET before going live.');
}
