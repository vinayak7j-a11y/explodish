// Sign-up and menu upload test (step 2.2). Run with: node test/signup.js (also part of npm test)
const { spawn } = require('child_process');
const os = require('os'), path = require('path'), fs = require('fs');

const PORT = 3100 + Math.floor(Math.random() * 800);
const BASE = 'http://localhost:' + PORT;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'explodish-signup-'));
const DB = path.join(tmp, 'test.db'), UPLOADS = path.join(tmp, 'uploads');
let passed = 0, failed = 0, n = 0;
const stamp = Date.now();

function check(name, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
async function api(method, url, o) {
  o = o || {};
  const headers = {};
  if (o.json !== undefined) headers['Content-Type'] = 'application/json';
  if (o.raw !== undefined) headers['Content-Type'] = o.type || 'application/octet-stream';
  if (o.cookie) headers.Cookie = o.cookie;
  const res = await fetch(BASE + url, { method, headers, body: o.json !== undefined ? JSON.stringify(o.json) : o.raw });
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, cookie: sc.length ? sc.map(c => c.split(';')[0]).join('; ') : '' };
}
function signup(extra) {
  n++;
  return api('POST', '/api/auth/register', { json: { name: 'Signup Cafe ' + n, email: 's' + n + '-' + stamp + '@test.dev', password: 'testpass123', ...(extra || {}) } });
}
const PNG = len => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(len)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(30)]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([30, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(30)]);
const dbBytes = () => ['', '-wal', '-shm'].reduce((s, e) => { try { return s + fs.statSync(DB + e).size; } catch (x) { return s; } }, 0);

async function run() {
  console.log('\nSign-up');
  const a = await signup({ whatsapp: '98765 43210', plan: 'yearly' });
  check('sign-up with WhatsApp number and plan works and starts as waiting', a.status === 201 && a.json.status === 'waiting' && a.json.plan === 'yearly' && a.json.whatsapp === '9876543210', JSON.stringify(a.json));
  const me = await api('GET', '/api/auth/me', { cookie: a.cookie });
  check('the saved plan and number are still there after logging in', me.json && me.json.plan === 'yearly' && me.json.whatsapp === '9876543210' && me.json.status === 'waiting');
  const b1 = await signup({ whatsapp: '12345' });
  check('a WhatsApp number that is too short is refused', b1.status === 400 && /WhatsApp/.test(b1.json.error), JSON.stringify(b1.json));
  const b2 = await signup({ whatsapp: 'call me maybe' });
  check('a WhatsApp number with letters is refused', b2.status === 400);
  const b3 = await signup({ plan: 'gold' });
  check('an unknown plan is refused', b3.status === 400 && /plan/.test(b3.json.error), JSON.stringify(b3.json));
  const c = await signup();
  check('sign-up without number or plan still works (older way)', c.status === 201 && c.json.status === 'waiting' && c.json.plan === null && c.json.whatsapp === null);
  const d = await signup({ whatsapp: '+91 98765-43210' });
  check('spaces and dashes are removed, the plus is kept', d.status === 201 && d.json.whatsapp === '+919876543210', JSON.stringify(d.json));

  console.log('\nMenu upload');
  const rid = a.json.id;
  const un = await api('POST', '/api/menu-files', { raw: PNG(20), type: 'image/png' });
  check('upload needs login (401)', un.status === 401);
  const u1 = await api('POST', '/api/menu-files', { raw: PNG(20), type: 'image/png', cookie: a.cookie });
  check('a PNG photo is accepted', u1.status === 201 && u1.json.type === 'png', JSON.stringify(u1.json));
  const onDisk = u1.json && path.join(UPLOADS, rid, u1.json.name);
  check('the file is saved on disk in the restaurant folder, not in the database', !!onDisk && fs.existsSync(onDisk) && fs.statSync(onDisk).size === u1.json.size);
  const u2 = await api('POST', '/api/menu-files', { raw: JPG, type: 'image/jpeg', cookie: a.cookie });
  check('a JPG photo is accepted', u2.status === 201 && u2.json.type === 'jpg');
  const u3 = await api('POST', '/api/menu-files', { raw: PDF, type: 'application/pdf', cookie: a.cookie });
  check('a PDF is accepted', u3.status === 201 && u3.json.type === 'pdf');
  const u4 = await api('POST', '/api/menu-files', { raw: WEBP, type: 'image/webp', cookie: a.cookie });
  check('a WEBP photo is accepted', u4.status === 201 && u4.json.type === 'webp');

  const t1 = await api('POST', '/api/menu-files', { raw: Buffer.from('just some text, not a picture'), type: 'image/png', cookie: a.cookie });
  check('text pretending to be a PNG is refused', t1.status === 400, JSON.stringify(t1.json));
  const t2 = await api('POST', '/api/menu-files', { raw: Buffer.from('<html><script>alert(1)</script></html>'), type: 'image/jpeg', cookie: a.cookie });
  check('a web page pretending to be a JPG is refused', t2.status === 400);
  const t3 = await api('POST', '/api/menu-files', { raw: Buffer.alloc(0), type: 'image/png', cookie: a.cookie });
  check('an empty upload is refused', t3.status === 400);

  let big;
  try { big = await api('POST', '/api/menu-files', { raw: PNG(10 * 1024 * 1024), type: 'image/png', cookie: a.cookie }); } catch (e) { big = { status: 'network error: ' + e.message }; }
  check('a file bigger than 10 MB is refused (413)', big.status === 413, String(big.status));

  const before = dbBytes();
  const u5 = await api('POST', '/api/menu-files', { raw: PNG(2 * 1024 * 1024), type: 'image/png', cookie: a.cookie });
  check('a 2 MB photo is accepted', u5.status === 201);
  check('the database does not grow when a file is uploaded', dbBytes() - before < 100 * 1024, String(dbBytes() - before));

  const l = await api('GET', '/api/menu-files', { cookie: a.cookie });
  check('the list shows the 5 uploaded files', l.status === 200 && l.json.length === 5 && l.json.every(f => f.name && f.type && f.size > 0), JSON.stringify(l.json));
  const u6 = await api('POST', '/api/menu-files', { raw: PNG(20), type: 'image/png', cookie: a.cookie });
  check('a 6th file is refused (409)', u6.status === 409 && /up to 5/.test(u6.json.error), JSON.stringify(u6.json));

  const other = await api('GET', '/api/menu-files', { cookie: c.cookie });
  check('another restaurant sees none of these files', other.status === 200 && other.json.length === 0);
  const steal = await api('DELETE', '/api/menu-files/' + u1.json.name, { cookie: c.cookie });
  check('another restaurant cannot delete these files', steal.status === 404 && fs.existsSync(onDisk));

  const del = await api('DELETE', '/api/menu-files/' + u1.json.name, { cookie: a.cookie });
  check('the owner can delete a file', del.status === 200 && !fs.existsSync(onDisk));
  const del2 = await api('DELETE', '/api/menu-files/' + u1.json.name, { cookie: a.cookie });
  check('deleting it again says not found (404)', del2.status === 404);
  const bad = await api('DELETE', '/api/menu-files/..%2F..%2Ftest.db', { cookie: a.cookie });
  check('a file name that tries to leave the folder is refused', bad.status === 400 || bad.status === 404, String(bad.status));
  const l2 = await api('GET', '/api/menu-files', { cookie: a.cookie });
  check('after deleting, room for one more file', l2.json.length === 4);
}

(async () => {
  const server = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT), DB_FILE: DB, UPLOADS_DIR: UPLOADS }, stdio: ['ignore', 'pipe', 'pipe'], cwd: path.join(__dirname, '..') });
  let up = false, log = '';
  server.stdout.on('data', d => { log += d; if (/running at/.test(log)) up = true; });
  server.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 50 && !up; i++) await new Promise(r => setTimeout(r, 100));
  if (!up) { console.log('FAIL  server did not start\n' + log); process.exit(1); }
  try { await run(); } catch (e) { failed++; console.log('  FAIL  test crashed: ' + e.message); }
  server.kill();
  await new Promise(r => setTimeout(r, 200));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + ': ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
})();
