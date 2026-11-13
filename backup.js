/* Explodish backups: a safe copy of the whole database (restaurants, dishes, orders, notification keys).
   - Run by hand:        node backup.js          (or: npm run backup)
   - Runs by itself:     set BACKUP_DIR in .env; a copy is made every BACKUP_EVERY_HOURS (default 24), the newest BACKUP_KEEP (default 14) are kept
   Uses SQLite's own online backup, so it is safe while orders are coming in. A backup is checked after it is made. */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', ''); }

function verifyBackup(file) {
  const d = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const ok = d.pragma('integrity_check')[0].integrity_check === 'ok';
    const count = t => { try { return d.prepare('SELECT COUNT(*) c FROM ' + t).get().c; } catch (e) { return 0; } };
    return { ok, restaurants: count('restaurants'), dishes: count('dishes'), orders: count('orders') };
  } finally { d.close(); }
}

function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /^explodish-.*\.db$/.test(f)).sort(); // names sort by time
}

async function runBackup(dir, keep) {
  const store = require('./db');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'explodish-' + stamp() + '.db');
  await store.backupTo(file);
  // make the copy one self-contained file (no -wal/-shm side files to lose or confuse)
  const w = new Database(file); w.pragma('journal_mode = DELETE'); w.close();
  const check = verifyBackup(file);
  if (!check.ok) { fs.rmSync(file, { force: true }); throw new Error('The backup failed its integrity check and was deleted'); }
  const all = listBackups(dir);
  const n = Number(keep) || 14;
  all.slice(0, Math.max(0, all.length - n)).forEach(f => { for (const ext of ['', '-wal', '-shm']) fs.rmSync(path.join(dir, f + ext), { force: true }); });
  return { file, bytes: fs.statSync(file).size, ...check };
}

function startSchedule() {
  const dir = process.env.BACKUP_DIR;
  if (!dir) return false;
  const everyMs = (Number(process.env.BACKUP_EVERY_HOURS) || 24) * 3600 * 1000;
  const keep = Number(process.env.BACKUP_KEEP) || 14;
  const tick = async () => {
    try {
      const last = listBackups(dir).pop();
      if (last && Date.now() - fs.statSync(path.join(dir, last)).mtimeMs < everyMs * 0.9) return;
      const r = await runBackup(dir, keep);
      console.log(`Backup saved: ${r.file} (${r.restaurants} restaurants, ${r.orders} orders)`);
    } catch (e) { console.error('BACKUP FAILED:', e.message); }
  };
  setTimeout(tick, 15 * 1000).unref();
  setInterval(tick, 60 * 60 * 1000).unref();
  console.log(`Automatic backups on: every ${everyMs / 3600000} h into ${dir}, keeping ${keep}`);
  return true;
}

module.exports = { runBackup, verifyBackup, listBackups, startSchedule };

if (require.main === module) {
  const dir = process.env.BACKUP_DIR || path.join(__dirname, 'backups');
  runBackup(dir, process.env.BACKUP_KEEP).then(r => {
    console.log(`Backup saved: ${r.file}\n  ${r.restaurants} restaurants, ${r.dishes} dishes, ${r.orders} orders, ${Math.round(r.bytes / 1024)} KB, integrity ok`);
    process.exit(0);
  }).catch(e => { console.error('Backup failed:', e.message); process.exit(1); });
}
