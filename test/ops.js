// Ops back-office test (step 2.3a). Run with: node test/ops.js (also part of npm test)
const { spawn } = require('child_process');
const os = require('os'), path = require('path'), fs = require('fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'explodish-ops-'));
let passed = 0, failed = 0, n = 0;
const stamp = Date.now();
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
async function startServer(tag, env) {
  const port = 3100 + Math.floor(Math.random() * 800);
  const child = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(port), DB_FILE: path.join(tmp, tag + '.db'), UPLOADS_DIR: path.join(tmp, tag + '-uploads'), ...env },
    stdio: ['ignore', 'pipe', 'pipe'], cwd: path.join(__dirname, '..')
  });
  let up = false, log = '';
  child.stdout.on('data', d => { log += d; if (/running at/.test(log)) up = true; });
  child.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60 && !up; i++) await new Promise(r => setTimeout(r, 100));
  if (!up) { console.log('FAIL  server did not start\n' + log); process.exit(1); }
  const base = 'http://localhost:' + port;
  async function api(method, url, o) {
    o = o || {};
    const headers = {};
    if (o.json !== undefined) headers['Content-Type'] = 'application/json';
    if (o.raw !== undefined) headers['Content-Type'] = o.type || 'application/octet-stream';
    if (o.cookie) headers.Cookie = o.cookie;
    const res = await fetch(base + url, { method, headers, body: o.json !== undefined ? JSON.stringify(o.json) : o.raw });
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.toString('utf8');
    let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: res.status, json, text, buf, type: res.headers.get('content-type') || '', nosniff: res.headers.get('x-content-type-options'), cookie: sc.length ? sc.map(c => c.split(';')[0]).join('; ') : '' };
  }
  return { api, stop: () => child.kill() };
}
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('ops test picture bytes')]);

async function main() {
  const A = await startServer('a', { OPS_PASSWORD: 'test-ops-pass' });
  const api = A.api;
  const signup = extra => { n++; return api('POST', '/api/auth/register', { json: { name: 'Ops Cafe ' + n, email: 'o' + n + '-' + stamp + '@test.dev', password: 'testpass123', ...(extra || {}) } }); };

  console.log('\nOps back-office: access');
  const page = await api('GET', '/ops');
  check('the /ops page is served', page.status === 200 && /text\/html/.test(page.type) && /ops\.js/.test(page.text));
  const js = await api('GET', '/ops.js');
  check('the /ops script is served', js.status === 200 && /javascript/.test(js.type));
  check('the queue needs the ops login (401)', (await api('GET', '/api/ops/restaurants')).status === 401);
  check('a wrong password is refused (401)', (await api('POST', '/api/ops/login', { json: { password: 'nope' } })).status === 401);
  check('a missing or non-text password is refused (401)', (await api('POST', '/api/ops/login', { json: { password: 12345 } })).status === 401 && (await api('POST', '/api/ops/login', { json: {} })).status === 401);
  const li = await api('POST', '/api/ops/login', { json: { password: 'test-ops-pass' } });
  check('the right password logs in', li.status === 200 && /explodish_ops=/.test(li.cookie));
  const ops = li.cookie;

  const owner = await signup({ whatsapp: '98765 43210', plan: 'monthly' });
  const other = await signup();
  check('an owner login does not open ops (401)', (await api('GET', '/api/ops/restaurants', { cookie: owner.cookie })).status === 401);
  check('the ops login does not open an owner area (401)', (await api('GET', '/api/dishes', { cookie: ops })).status === 401);

  console.log('\nOps back-office: the queue');
  const up = await api('POST', '/api/menu-files', { raw: PNG, type: 'image/png', cookie: owner.cookie });
  const list = await api('GET', '/api/ops/restaurants', { cookie: ops });
  const mine = list.json && list.json.find(r => r.id === owner.json.id);
  const theirs = list.json && list.json.find(r => r.id === other.json.id);
  check('both new sign-ups are listed as waiting', mine && theirs && mine.status === 'waiting' && theirs.status === 'waiting', JSON.stringify(list.json));
  check('the queue shows number, plan, files and dishes', mine.whatsapp === '9876543210' && mine.plan === 'monthly' && mine.fileCount === 1 && mine.dishCount === 0 && theirs.fileCount === 0 && theirs.whatsapp === null);
  check('the newest sign-up comes first', list.json.findIndex(r => r.id === other.json.id) < list.json.findIndex(r => r.id === owner.json.id));
  check('no password data is ever sent', !/passwordHash|password_hash|\$2[aby]\$/.test(list.text));

  console.log('\nOps back-office: menu files');
  const fl = await api('GET', '/api/ops/restaurants/' + owner.json.id + '/files', { cookie: ops });
  check('the founder sees the uploaded menu files', fl.status === 200 && fl.json.length === 1 && fl.json[0].type === 'png');
  const file = await api('GET', '/api/ops/restaurants/' + owner.json.id + '/files/' + up.json.name, { cookie: ops });
  check('the file opens as the right picture with the same bytes', file.status === 200 && file.type === 'image/png' && file.buf.equals(PNG));
  check('the file is sent with nosniff', file.nosniff === 'nosniff');
  check('a file needs the ops login (401)', (await api('GET', '/api/ops/restaurants/' + owner.json.id + '/files/' + up.json.name)).status === 401);
  check('a file name that leaves the folder is refused', (await api('GET', '/api/ops/restaurants/' + owner.json.id + '/files/..%2F..%2Ftest.db', { cookie: ops })).status === 400);
  check('another restaurant does not have this file (404)', (await api('GET', '/api/ops/restaurants/' + other.json.id + '/files/' + up.json.name, { cookie: ops })).status === 404);
  check('an unknown restaurant gives 404', (await api('GET', '/api/ops/restaurants/nope/files', { cookie: ops })).status === 404);

  console.log('\nOps back-office: changing a restaurant');
  const put = (id, json) => api('PUT', '/api/ops/restaurants/' + id, { json, cookie: ops });
  const s1 = await put(owner.json.id, { status: 'building' });
  check('status can be changed', s1.status === 200 && s1.json.status === 'building' && s1.json.fileCount === 1);
  const again = await api('GET', '/api/ops/restaurants', { cookie: ops });
  check('the change is saved', again.json.find(r => r.id === owner.json.id).status === 'building' && again.json.find(r => r.id === other.json.id).status === 'waiting');
  check('the owner sees the new status too', (await api('GET', '/api/auth/me', { cookie: owner.cookie })).json.status === 'building');
  check('an unknown status is refused (400)', (await put(owner.json.id, { status: 'banana' })).status === 400);
  check('an unknown restaurant gives 404', (await put('nope', { status: 'live' })).status === 404);
  const p1 = await put(owner.json.id, { paidUntil: '2026-12-31' });
  check('paid-until can be set', p1.status === 200 && p1.json.paidUntil === '2026-12-31');
  check('a date that does not exist is refused', (await put(owner.json.id, { paidUntil: '2026-02-30' })).status === 400);
  check('a date written in words is refused', (await put(owner.json.id, { paidUntil: 'tomorrow' })).status === 400);
  check('paid-until can be cleared', (await put(owner.json.id, { paidUntil: null })).json.paidUntil === null);
  check('the plan can be changed, and gold is refused', (await put(owner.json.id, { plan: 'yearly' })).json.plan === 'yearly' && (await put(owner.json.id, { plan: 'gold' })).status === 400);
  check('an empty change is refused', (await put(owner.json.id, {})).status === 400);
  check('changes need the ops login (401)', (await api('PUT', '/api/ops/restaurants/' + owner.json.id, { json: { status: 'live' }, cookie: owner.cookie })).status === 401);

  console.log('\nOps back-office: logging out and switching off');
  const lo = await api('POST', '/api/ops/logout', { cookie: ops });
  check('logging out works', lo.status === 200 && /explodish_ops=;/.test(lo.cookie + ';'));
  A.stop();

  const B = await startServer('b', { NODE_ENV: 'production', JWT_SECRET: 'test-secret-for-ops-test', OPS_PASSWORD: '' });
  const b1 = await B.api('POST', '/api/ops/login', { json: { password: 'ops-dev-password' } });
  const b2 = await B.api('GET', '/api/ops/restaurants');
  check('in production without OPS_PASSWORD ops is switched off (503)', b1.status === 503 && b2.status === 503 && /OPS_PASSWORD/.test(b1.json.error));
  check('the dev password does not work in production', b1.status !== 200);
  check('the rest of the app still works', (await B.api('GET', '/healthz')).status === 200);
  B.stop();

  const C = await startServer('c', { OPS_PASSWORD: '' });
  const c1 = await C.api('POST', '/api/ops/login', { json: { password: 'ops-dev-password' } });
  check('in development without OPS_PASSWORD the printed dev password works', c1.status === 200);
  C.stop();
}

main().then(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + ': ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
}).catch(e => { console.error(e); process.exit(1); });
