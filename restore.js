/* Explodish restore: put a backup back as the live database.
   STOP THE SERVER FIRST.   Usage:  node restore.js backups/explodish-2026-11-08_03-00-00-000.db
   The current database is kept next to it as ".before-restore-<time>", so a mistaken restore can be undone. */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('Usage: node restore.js <backup file>\nThe file was not found.'); process.exit(1); }
const live = process.env.DB_FILE || path.join(__dirname, 'data', 'explodish.db');

const chk = new Database(src, { readonly: true, fileMustExist: true });
let info;
try {
  if (chk.pragma('integrity_check')[0].integrity_check !== 'ok') throw new Error('integrity check failed');
  info = { restaurants: chk.prepare('SELECT COUNT(*) c FROM restaurants').get().c, orders: chk.prepare('SELECT COUNT(*) c FROM orders').get().c };
} catch (e) { console.error('That backup is not usable (' + e.message + '). Nothing was changed.'); process.exit(1); }
finally { chk.close(); }

fs.mkdirSync(path.dirname(live), { recursive: true });
const t = new Date().toISOString().replace(/[:.]/g, '-');
for (const ext of ['', '-wal', '-shm']) {
  if (fs.existsSync(live + ext)) fs.copyFileSync(live + ext, live + '.before-restore-' + t + ext);
}
for (const ext of ['-wal', '-shm']) fs.rmSync(live + ext, { force: true });
fs.copyFileSync(src, live);
console.log(`Restored ${info.restaurants} restaurants and ${info.orders} orders into ${live}.\nThe previous database was kept as ${live}.before-restore-${t}\nNow start the server.`);
