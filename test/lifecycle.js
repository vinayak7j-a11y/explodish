// Restaurant lifecycle data test (step 2.1). Run with: node test/lifecycle.js (also part of npm test)
const path = require('path'), os = require('os'), fs = require('fs'), { spawnSync } = require('child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'explodish-lifecycle-'));
process.env.DB_FILE = path.join(tmp, 'live.db');
const store = require('../db');

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
const now = () => new Date().toISOString();
const mk = (id, extra) => store.createRestaurant({ id, name: 'Cafe ' + id, email: id + '@lifecycle.test', passwordHash: 'x', createdAt: now(), ...(extra || {}) });

console.log('\nRestaurant lifecycle data');

const a = mk('lc-a');
check('a normal new restaurant is live with no plan', a.status === 'live' && a.plan === null && a.paidUntil === null && a.previewToken === null && a.whatsapp === null, JSON.stringify(a));

const b = mk('lc-b', { status: 'waiting' });
check('a restaurant can be created as waiting', b.status === 'waiting' && store.findById('lc-b').status === 'waiting');

let threw = false;
try { mk('lc-bad', { status: 'nonsense' }); } catch (e) { threw = true; }
check('an unknown status is refused and nothing is stored', threw && !store.findByEmail('lc-bad@lifecycle.test'));

check('setLifecycle changes only what is passed', (() => {
  store.setLifecycle('lc-b', { status: 'building', plan: 'monthly', whatsapp: '+919800000000' });
  const r = store.findById('lc-b');
  return r.status === 'building' && r.plan === 'monthly' && r.whatsapp === '+919800000000' && r.paidUntil === null;
})());

check('paid-until and preview link can be set', (() => {
  store.setLifecycle('lc-b', { status: 'preview', paidUntil: '2026-12-31T00:00:00.000Z', previewToken: 'tok-lc-b-123' });
  const r = store.findById('lc-b');
  return r.status === 'preview' && r.paidUntil === '2026-12-31T00:00:00.000Z' && r.previewToken === 'tok-lc-b-123';
})());

threw = false;
try { store.setLifecycle('lc-b', { status: 'bogus', plan: 'yearly' }); } catch (e) { threw = true; }
check('an unknown status in setLifecycle is refused and changes nothing', threw && store.findById('lc-b').status === 'preview' && store.findById('lc-b').plan === 'monthly');

check('the preview link finds the right restaurant', store.findByPreviewToken('tok-lc-b-123').id === 'lc-b');
check('an unknown or empty preview link finds nothing', store.findByPreviewToken('nope') === null && store.findByPreviewToken('') === null && store.findByPreviewToken(null) === null);

const c = mk('lc-c');
threw = false;
try { store.setLifecycle('lc-c', { previewToken: 'tok-lc-b-123' }); } catch (e) { threw = true; }
check('two restaurants cannot share a preview link', threw && store.findById('lc-c').previewToken === null);

check('a preview link can be cleared', (() => {
  store.setLifecycle('lc-b', { previewToken: null });
  return store.findById('lc-b').previewToken === null && store.findByPreviewToken('tok-lc-b-123') === null;
})());

check('setLifecycle with nothing to change does nothing', store.setLifecycle('lc-b', {}) === 0);

// An older database (made before this step) must open fine, keep its restaurants, and show them as live.
const Database = require('better-sqlite3');
const oldFile = path.join(tmp, 'old.db');
const od = new Database(oldFile);
od.exec('CREATE TABLE restaurants (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)');
od.prepare('INSERT INTO restaurants (id, slug, name, email, password_hash, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)').run('old-1', 'old-cafe', 'Old Cafe', 'old@lifecycle.test', 'x', now());
od.close();
const root = path.join(__dirname, '..');
const script = "const s=require('./db');console.log(JSON.stringify(s.findByEmail('old@lifecycle.test')));";
const run1 = spawnSync(process.execPath, ['-e', script], { cwd: root, env: { ...process.env, DB_FILE: oldFile }, encoding: 'utf8' });
let old = null;
try { old = JSON.parse(run1.stdout.trim().split('\n').pop()); } catch (e) {}
check('an older database opens and its restaurant is shown as live', run1.status === 0 && old && old.status === 'live' && old.id === 'old-1', (run1.stderr || run1.stdout).slice(0, 200));
const run2 = spawnSync(process.execPath, ['-e', script], { cwd: root, env: { ...process.env, DB_FILE: oldFile }, encoding: 'utf8' });
check('opening it a second time is harmless', run2.status === 0 && /"status":"live"/.test(run2.stdout), (run2.stderr || '').slice(0, 200));

try { store.close(); } catch (e) {}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + ': ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
