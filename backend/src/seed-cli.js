import { ensureDatabase, migrate, pool } from './db.js';
import { initSettings } from './lib/settings.js';
import { resetDatabase, seedIfEmpty } from './seed.js';
await ensureDatabase(); await migrate(); await initSettings();
if (process.argv.includes('--reset')) { await resetDatabase(); console.log('[seed] All data cleared.'); }
const did = await seedIfEmpty();
if (!did) console.log('[seed] Database already has users. Run "npm run reset" to wipe and reseed.');
await pool.end();
