// Backup and restore test. Run with: node test/backup.js (also part of npm test)
const path = require('path'), os = require('os'), fs = require('fs'), { spawnSync } = require('child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'explodish-backup-'));
process.env.DB_FILE = path.join(tmp, 'live.db');
const store = require('../db');
const { runBackup, verifyBackup, listBackups } = require('../backup');

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\nBackup and restore');
  store.createRestaurant({ id: 'r-b', slug: 'backup-test', name: 'Backup Cafe', email: 'b@test.dev', passwordHash: 'x', createdAt: new Date().toISOString() });
  store.insertOrder({ id: 'o1', restaurantId: 'r-b', time: new Date().toISOString(), status: 'new', total: 99, items: [] });
  store.setKv('vapid_public', 'KEEP-ME');

  const dir = path.join(tmp, 'backups');
  const r1 = await runBackup(dir, 3);
  check('a backup is made and passes its integrity check', fs.existsSync(r1.file) && r1.ok === true && r1.restaurants === 1 && r1.orders === 1, JSON.stringify(r1));
  check('the backup holds the same data', verifyBackup(r1.file).orders === 1);
  check('a backup is one single file (no -wal or -shm leftovers)', fs.readdirSync(dir).every(f => /\.db$/.test(f)), fs.readdirSync(dir).join(', '));

  for (let i = 0; i < 4; i++) { await sleep(15); await runBackup(dir, 3); }
  check('only the newest 3 backups are kept', listBackups(dir).length === 3, String(listBackups(dir).length));

  // add more data AFTER the backup, then restore the backup and check the later data is gone
  const kept = path.join(dir, listBackups(dir)[0]);
  store.insertOrder({ id: 'o2', restaurantId: 'r-b', time: new Date().toISOString(), status: 'new', total: 50, items: [] });
  const liveBefore = store.listOrders('r-b').length;
  store.close();
  const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'restore.js'), kept], { env: { ...process.env, DB_FILE: path.join(tmp, 'live.db') }, encoding: 'utf8' });
  check('restore runs and reports success', res.status === 0 && /Restored 1 restaurants/.test(res.stdout), res.stdout + res.stderr);
  const Database = require('better-sqlite3');
  const d = new Database(path.join(tmp, 'live.db'), { readonly: true });
  const nOrders = d.prepare('SELECT COUNT(*) c FROM orders').get().c;
  const kv = d.prepare("SELECT value FROM kv WHERE key = 'vapid_public'").get();
  d.close();
  check('after restore the database is back to the backup (' + liveBefore + ' orders became 1)', liveBefore === 2 && nOrders === 1);
  check('notification keys survive the backup', kv && kv.value === 'KEEP-ME');
  check('the old database was kept next to it', fs.readdirSync(tmp).some(f => /\.before-restore-/.test(f)));

  const bad = path.join(tmp, 'junk.db'); fs.writeFileSync(bad, 'this is not a database');
  const res2 = spawnSync(process.execPath, [path.join(__dirname, '..', 'restore.js'), bad], { env: { ...process.env, DB_FILE: path.join(tmp, 'live.db') }, encoding: 'utf8' });
  check('a damaged backup is refused and nothing changes', res2.status !== 0);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + ': ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
