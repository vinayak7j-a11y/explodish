// Founder "open as owner" test (step 2.3b). Run with: node test/opsopen.js (also part of npm test)
const { spawn } = require('child_process');
const os = require('os'), path = require('path'), fs = require('fs');

const PORT = 3100 + Math.floor(Math.random() * 800);
const BASE = 'http://localhost:' + PORT;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'explodish-opsopen-'));
let passed = 0, failed = 0;
const stamp = Date.now();
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
async function api(method, url, o) {
  o = o || {};
  const headers = {};
  if (o.json !== undefined) headers['Content-Type'] = 'application/json';
  if (o.cookie) headers.Cookie = o.cookie;
  const res = await fetch(BASE + url, { method, headers, body: o.json !== undefined ? JSON.stringify(o.json) : undefined });
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text, raw, cookie: raw.length ? raw.map(c => c.split(';')[0]).join('; ') : '' };
}

async function run() {
  const owner = await api('POST', '/api/auth/register', { json: { name: 'Open Cafe', email: 'open-' + stamp + '@test.dev', password: 'testpass123' } });
  const stranger = await api('POST', '/api/auth/register', { json: { name: 'Other Cafe', email: 'other-' + stamp + '@test.dev', password: 'testpass123' } });
  const ops = (await api('POST', '/api/ops/login', { json: { password: 'test-ops-pass' } })).cookie;
  const id = owner.json.id;

  console.log('\nFounder opens a restaurant editor');
  check('it needs the ops login (401)', (await api('POST', '/api/ops/restaurants/' + id + '/open-as-owner')).status === 401);
  check('an owner login cannot do it (401)', (await api('POST', '/api/ops/restaurants/' + id + '/open-as-owner', { cookie: stranger.cookie })).status === 401);
  check('an unknown restaurant gives 404', (await api('POST', '/api/ops/restaurants/nope/open-as-owner', { cookie: ops })).status === 404);

  const open = await api('POST', '/api/ops/restaurants/' + id + '/open-as-owner', { cookie: ops });
  check('the founder gets a session and is sent to /admin', open.status === 200 && open.json.url === '/admin' && /explodish/i.test(open.cookie), JSON.stringify(open.raw));
  const setCookie = open.raw.find(c => /^[^=]*=ey/.test(c) || /HttpOnly/i.test(c)) || '';
  const maxAge = Number((setCookie.match(/Max-Age=(\d+)/i) || [])[1]);
  check('the session lasts about 3 hours, not 30 days', maxAge > 10000 && maxAge <= 10800, String(maxAge));
  check('the cookie cannot be read by page scripts (HttpOnly)', /HttpOnly/i.test(setCookie));

  const me = await api('GET', '/api/auth/me', { cookie: open.cookie });
  check('the dashboard opens as that restaurant and knows it is a founder session', me.status === 200 && me.json.id === id && me.json.viaOps === true, JSON.stringify(me.json));
  check('the founder can use the menu editor (dishes list works)', (await api('GET', '/api/dishes', { cookie: open.cookie })).status === 200);
  check('the founder can publish a dish for the restaurant', (await api('POST', '/api/dishes', { json: { name: 'Founder Burger', mode: 'A', basePrice: 149, category: 'Burgers', image: null, removalRefund: false, dietary: 'veg', jainFriendly: false, ingredients: [{ id: 'b1', name: 'Bun top', included: true, mandatory: true, unitPrice: 0, maxQty: 1, allergens: [] }], modifiers: [] }, cookie: open.cookie })).status === 201);
  check('this session does not open the ops area (401)', (await api('GET', '/api/ops/restaurants', { cookie: open.cookie })).status === 401);

  const normal = await api('POST', '/api/auth/login', { json: { email: 'open-' + stamp + '@test.dev', password: 'testpass123' } });
  const nme = await api('GET', '/api/auth/me', { cookie: normal.cookie });
  check('a normal owner login is not marked as a founder session', nme.status === 200 && nme.json.viaOps === false);

  const lo = await api('POST', '/api/auth/logout', { cookie: open.cookie });
  check('logging out ends it', lo.status === 200);

  const js = await fetch(BASE + '/app.js').then(r => r.text());
  check('the dashboard script has the founder banner', /renderOpsBanner/.test(js) && /Founder view/.test(js));
  const opsjs = await fetch(BASE + '/ops.js').then(r => r.text());
  check('the ops script has the open-editor button', /Open their menu editor/.test(opsjs));
}

(async () => {
  const server = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT), DB_FILE: path.join(tmp, 't.db'), UPLOADS_DIR: path.join(tmp, 'up'), OPS_PASSWORD: 'test-ops-pass' }, stdio: ['ignore', 'pipe', 'pipe'], cwd: path.join(__dirname, '..') });
  let up = false, log = '';
  server.stdout.on('data', d => { log += d; if (/running at/.test(log)) up = true; });
  server.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60 && !up; i++) await new Promise(r => setTimeout(r, 100));
  if (!up) { console.log('FAIL  server did not start\n' + log); process.exit(1); }
  try { await run(); } catch (e) { failed++; console.log('  FAIL  test crashed: ' + e.message); }
  server.kill();
  await new Promise(r => setTimeout(r, 200));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + ': ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
})();
