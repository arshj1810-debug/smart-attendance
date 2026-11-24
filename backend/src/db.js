import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const { Pool, Client } = pg;
// Return DATE columns as plain 'YYYY-MM-DD' strings and counts as numbers (avoids timezone surprises).
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

const ssl = config.dbSsl ? { rejectUnauthorized: false } : undefined; // hosted databases need DATABASE_SSL=true
export const pool = new Pool({ connectionString: config.databaseUrl, ssl, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000 });
pool.on('error', (e) => console.error('[db] idle client error:', e.message));

export const query = (text, params) => pool.query(text, params);
export const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
export const many = async (text, params) => (await pool.query(text, params)).rows;

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw e;
  } finally { client.release(); }
}

// Create the database itself when it does not exist yet (needs a role allowed to CREATE DATABASE).
export async function ensureDatabase() {
  const url = new URL(config.databaseUrl);
  const name = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'smart_attendance';
  try { await pool.query('SELECT 1'); return; } catch (e) {
    if (e.code !== '3D000') throw e;               // 3D000 = database does not exist
  }
  const admin = new URL(config.databaseUrl); admin.pathname = '/postgres';
  const c = new Client({ connectionString: admin.toString(), ssl });
  await c.connect();
  try { await c.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`); console.log(`[db] created database "${name}"`); }
  finally { await c.end(); }
}

export async function migrate() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sql = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
  await pool.query(sql);
}