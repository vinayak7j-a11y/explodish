// Private preview test (step 2.5). Run with: node test/preview.js (also part of npm test)
const { spawn } = require('child_process');
const os = require('os'), path = require('path'), fs = require('fs');

const PORT = 3100 + Math.floor(Math.random() * 800);
const BASE = 'http://localhost:' + PORT;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'explodish-preview-'));
const DB = path.join(tmp, 't.db');
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
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text, type: res.headers.get('content-type') || '', robots: res.headers.get('x-robots-tag'), cookie: sc.length ? sc.map(c => c.split(';')[0]).join('; ') : '' };
}
const burger = {
  name: 'Preview Burger', mode: 'A', basePrice: 149, category: 'Burgers', image: null,
  removalRefund: false, dietary: 'veg', jainFriendly: false,
  ingredients: [
    { id: 'b1', name: 'Bun top', included: true, mandatory: true, unitPrice: 0, maxQty: 1, allergens: [] },
    { id: 'b2', name: 'Lettuce', included: true, mandatory: false, unitPrice: 10, maxQty: 2, allergens: [] },
    { id: 'b4', name: 'Cheese slice', included: true, mandatory: false, unitPrice: 20, maxQty: 3, allergens: ['Dairy'] },
    { id: 'b5', name: 'Veg patty', included: true, mandatory: true, unitPrice: 40, maxQty: 2, allergens: [] }
  ],
  modifiers: [{ id: 'mod-spice', name: 'Spice', options: [{ label: 'Regular', priceDelta: 0 }, { label: 'Spicy', priceDelta: 0 }] }]
};
function orderFor(dish, price, clientId) {
  return {
    table: '4', clientId,
    items: [{
      dishId: dish.id, dishName: dish.name, price,
      config: [{ id: 'b1', qty: 1 }, { id: 'b2', qty: 1 }, { id: 'b4', qty: 2 }, { id: 'b5', qty: 1 }],
      modifierChoices: { 'mod-spice': 0 },
      mods: ['+1 Cheese slice'], deltas: [{ label: '+ Cheese slice', amount: 20, noChange: false }]
    }]
  };
}

async function run() {
  const reg = await api('POST', '/api/auth/register', { json: { name: 'Preview Cafe', email: 'pv-' + stamp + '@test.dev', password: 'testpass123' } });
  const owner = reg.cookie, id = reg.json.id, slug = reg.json.slug;
  const dish = (await api('POST', '/api/dishes', { json: burger, cookie: owner })).json;
  const ops = (await api('POST', '/api/ops/login', { json: { password: 'test-ops-pass' } })).cookie;

  console.log('\nBefore a preview');
  check('the public menu works as before', (await api('GET', '/api/r/' + slug)).status === 200 && (await api('GET', '/api/r/' + slug + '/dishes')).json.length === 1);

  console.log('\nStarting a preview');
  check('starting a preview needs the ops login (401)', (await api('POST', '/api/ops/restaurants/' + id + '/preview', { json: {} })).status === 401);
  check('an owner login cannot start it (401)', (await api('POST', '/api/ops/restaurants/' + id + '/preview', { json: {}, cookie: owner })).status === 401);
  check('an unknown restaurant gives 404', (await api('POST', '/api/ops/restaurants/nope/preview', { json: {}, cookie: ops })).status === 404);
  for (const bad of [0, 31, 2.5, 'x', null]) {
    const r = await api('POST', '/api/ops/restaurants/' + id + '/preview', { json: { days: bad }, cookie: ops });
    check('days = ' + JSON.stringify(bad) + ' is refused (400)', r.status === 400, String(r.status));
  }
  const start = await api('POST', '/api/ops/restaurants/' + id + '/preview', { json: {}, cookie: ops });
  const token = start.json && start.json.previewToken;
  const daysLeft = start.json && (new Date(start.json.previewUntil).getTime() - Date.now()) / 86400000;
  check('a preview starts: status preview, secret link, about 7 days', start.status === 200 && start.json.status === 'preview' && /^[a-f0-9]{24}$/.test(token) && daysLeft > 6.9 && daysLeft < 7.1, JSON.stringify(start.json));
  check('the answer gives the full private link', start.json.previewUrl.endsWith('/p/' + token));

  console.log('\nThe public is shut out, the private link works');
  check('the public menu address is closed (404)', (await api('GET', '/api/r/' + slug)).status === 404);
  check('the public dishes are closed (404)', (await api('GET', '/api/r/' + slug + '/dishes')).status === 404);
  check('the public cannot order (404)', (await api('POST', '/api/r/' + slug + '/orders', { json: orderFor(dish, 169) })).status === 404);
  check('the owner can still see their own menu', (await api('GET', '/api/r/' + slug, { cookie: owner })).status === 200);
  const pv = await api('GET', '/api/preview/' + token);
  check('the private link gives the menu info and the end date', pv.status === 200 && pv.json.name === 'Preview Cafe' && !!pv.json.preview.until, JSON.stringify(pv.json));
  const pd = await api('GET', '/api/preview/' + token + '/dishes');
  check('the private link lists the dishes', pd.status === 200 && pd.json.length === 1 && pd.json[0].name === 'Preview Burger');
  check('a wrong secret finds nothing (404)', (await api('GET', '/api/preview/aaaaaaaaaaaaaaaaaaaaaaaa')).status === 404 && (await api('GET', '/api/preview/short')).status === 404);
  const page = await api('GET', '/p/' + token);
  check('the /p/ page opens and is hidden from search engines', page.status === 200 && /text\/html/.test(page.type) && /noindex/.test(page.robots || ''));

  console.log('\nPractice orders');
  const bad = await api('POST', '/api/preview/' + token + '/orders', { json: orderFor(dish, 100) });
  check('a wrong price is still refused (409)', bad.status === 409);
  const placed = await api('POST', '/api/preview/' + token + '/orders', { json: orderFor(dish, 169, 'preview-try-0001') });
  check('an order from the preview link is accepted', placed.status === 201 && placed.json.total === 169, JSON.stringify(placed.json));
  check('it is a practice order: marked test, table TEST, no order number', placed.json.test === true && placed.json.table === 'TEST' && placed.json.number === null);
  const kitchen = await api('GET', '/api/orders', { cookie: owner });
  const seen = kitchen.json && kitchen.json.find(o => o.id === placed.json.id);
  check('it rings the owner\'s kitchen screen', !!seen && seen.test === true && seen.status === 'new');
  const retry = await api('POST', '/api/preview/' + token + '/orders', { json: orderFor(dish, 169, 'preview-try-0001') });
  check('sending the same order again does not make a second one', retry.status === 200 && retry.json.id === placed.json.id);
  const st = await api('GET', '/api/preview/' + token + '/orders/' + placed.json.id + '/status');
  check('the order progress works at the private link', st.status === 200 && st.json.status === 'new');
  const cancel = await api('POST', '/api/preview/' + token + '/orders/' + placed.json.id + '/cancel');
  check('cancelling works at the private link', cancel.status === 200 && cancel.json.status === 'cancelled');
  const real = await api('POST', '/api/auth/login', { json: { email: 'pv-' + stamp + '@test.dev', password: 'testpass123' } });
  check('the other restaurants and the public cannot see this order through the slug (404)', (await api('GET', '/api/r/' + slug + '/orders/' + placed.json.id + '/status')).status === 404 && real.status === 200);

  console.log('\nWhen the preview ends');
  const Database = require('better-sqlite3');
  const d = new Database(DB);
  d.prepare('UPDATE restaurants SET preview_until = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), id);
  d.close();
  check('an ended preview link stops working (404)', (await api('GET', '/api/preview/' + token)).status === 404 && (await api('POST', '/api/preview/' + token + '/orders', { json: orderFor(dish, 169) })).status === 404);
  check('the public is still shut out', (await api('GET', '/api/r/' + slug)).status === 404);
  const again = await api('POST', '/api/ops/restaurants/' + id + '/preview', { json: { days: 3 }, cookie: ops });
  check('restarting gives the same link for 3 more days', again.status === 200 && again.json.previewToken === token && (new Date(again.json.previewUntil).getTime() - Date.now()) / 86400000 > 2.9);
  check('the link works again', (await api('GET', '/api/preview/' + token)).status === 200);

  console.log('\nGoing live');
  const live = await api('PUT', '/api/ops/restaurants/' + id, { json: { status: 'live' }, cookie: ops });
  check('setting the status to live works', live.status === 200 && live.json.status === 'live');
  check('the public menu is open again', (await api('GET', '/api/r/' + slug)).status === 200 && (await api('GET', '/api/r/' + slug + '/dishes')).json.length === 1);
  check('the private link is closed once live (404)', (await api('GET', '/api/preview/' + token)).status === 404);
  const realOrder = await api('POST', '/api/r/' + slug + '/orders', { json: orderFor(dish, 169) });
  check('a real order works and gets an order number', realOrder.status === 201 && !realOrder.json.test && realOrder.json.number === 1, JSON.stringify(realOrder.json));

  console.log('\nThe Preview status button');
  const reg2 = await api('POST', '/api/auth/register', { json: { name: 'Button Cafe', email: 'pv2-' + stamp + '@test.dev', password: 'testpass123' } });
  const b = await api('PUT', '/api/ops/restaurants/' + reg2.json.id, { json: { status: 'preview' }, cookie: ops });
  check('choosing Preview by hand also makes a working link', b.status === 200 && /^[a-f0-9]{24}$/.test(b.json.previewToken) && (new Date(b.json.previewUntil).getTime() - Date.now()) / 86400000 > 6.9);
  check('and that link opens', (await api('GET', '/api/preview/' + b.json.previewToken)).status === 200);
  const list = await api('GET', '/api/ops/restaurants', { cookie: ops });
  check('the queue shows the preview link and end date to the founder', !!list.json.find(r => r.id === reg2.json.id).previewToken);
  check('an owner never receives the secret in their own details', !/previewToken/.test((await api('GET', '/api/auth/me', { cookie: reg2.cookie })).text));

  const js = await fetch(BASE + '/app.js').then(r => r.text());
  check('the customer script knows the /p/ link and shows the banner', /custBase/.test(js) && /showTokenPreviewBanner/.test(js));
  const opsjs = await fetch(BASE + '/ops.js').then(r => r.text());
  check('the ops script has the preview buttons', /Start 7-day preview/.test(opsjs));
}

(async () => {
  const server = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT), DB_FILE: DB, UPLOADS_DIR: path.join(tmp, 'up'), OPS_PASSWORD: 'test-ops-pass' }, stdio: ['ignore', 'pipe', 'pipe'], cwd: path.join(__dirname, '..') });
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
