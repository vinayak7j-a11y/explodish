// Explodish smoke test: starts the server on a temp port and temp database,
// then checks the paths that must never break. Run with: npm test
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const PORT = 3100 + Math.floor(Math.random() * 800);
const BASE = `http://localhost:${PORT}`;
const DB = path.join(os.tmpdir(), `explodish-test-${process.pid}.db`);
let passed = 0, failed = 0, cookie = '';

function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}
async function call(method, url, body, useCookie) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (useCookie && cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, type: res.headers.get('content-type') || '', text, json };
}

const burger = {
  name: 'Test Burger', mode: 'A', basePrice: 149, category: 'Burgers', image: null,
  removalRefund: false, dietary: 'veg', jainFriendly: false,
  ingredients: [
    { id: 'b1', name: 'Bun top', included: true, mandatory: true, unitPrice: 0, maxQty: 1, allergens: [] },
    { id: 'b2', name: 'Lettuce', included: true, mandatory: false, unitPrice: 10, maxQty: 2, allergens: [] },
    { id: 'b4', name: 'Cheese slice', included: true, mandatory: false, unitPrice: 20, maxQty: 3, allergens: ['Dairy'] },
    { id: 'b5', name: 'Veg patty', included: true, mandatory: true, unitPrice: 40, maxQty: 2, allergens: [] }
  ],
  modifiers: [{ id: 'mod-spice', name: 'Spice', options: [{ label: 'Regular', priceDelta: 0 }, { label: 'Spicy', priceDelta: 0 }] }]
};
function orderFor(dish, price) {
  return {
    table: '4',
    items: [{
      dishId: dish.id, dishName: dish.name, price,
      config: [{ id: 'b1', qty: 1 }, { id: 'b2', qty: 1 }, { id: 'b4', qty: 2 }, { id: 'b5', qty: 1 }],
      modifierChoices: { 'mod-spice': 0 },
      mods: ['+1 Cheese slice'], deltas: [{ label: '+ Cheese slice', amount: 20, noChange: false }]
    }]
  };
}

async function run(slugHolder) {
  console.log('\nPages and files');
  const reg = await call('POST', '/api/auth/register', { name: 'Smoke Test Cafe', email: `t${Date.now()}@test.dev`, password: 'testpass123' });
  check('register creates an account', reg.status === 201 && reg.json && reg.json.slug, `status ${reg.status}`);
  const slug = reg.json && reg.json.slug;

  const page = await call('GET', `/r/${slug}?table=4`);
  check('customer page returns HTML', page.status === 200 && page.type.includes('text/html'));
  check('customer page uses absolute /styles.css and /app.js (P0 regression)',
    page.text.includes('href="/styles.css"') && page.text.includes('src="/app.js"'),
    'index.html has relative asset paths, which break on /r/<slug>');
  const css = await call('GET', '/styles.css');
  check('/styles.css is served as CSS', css.status === 200 && css.type.includes('text/css'), css.type);
  const js = await call('GET', '/app.js');
  check('/app.js is served as JavaScript', js.status === 200 && /javascript/.test(js.type), js.type);
  const admin = await call('GET', '/admin');
  check('/admin page loads', admin.status === 200);

  console.log('\nMenu');
  const created = await call('POST', '/api/dishes', burger, true);
  check('owner can publish a dish', created.status === 201 || created.status === 200, `status ${created.status}`);
  const dish = created.json;
  const pub = await call('GET', `/api/r/${slug}/dishes`);
  check('public menu lists the dish', Array.isArray(pub.json) && pub.json.some(d => d.name === 'Test Burger'));

  console.log('\nOrders');
  const good = await call('POST', `/api/r/${slug}/orders`, orderFor(dish, 169));
  check('valid order is accepted (status new, total 169)', good.status === 201 && good.json.status === 'new' && good.json.total === 169, `status ${good.status}`);
  const cheat = await call('POST', `/api/r/${slug}/orders`, orderFor(dish, 100));
  check('tampered price is rejected (409)', cheat.status === 409, `status ${cheat.status}`);
  const empty = await call('POST', `/api/r/${slug}/orders`, { items: [] });
  check('empty order is rejected (400)', empty.status === 400, `status ${empty.status}`);
  const noauth = await call('GET', '/api/orders');
  check('kitchen orders need login (401)', noauth.status === 401, `status ${noauth.status}`);
  const list = await call('GET', '/api/orders', undefined, true);
  check('owner sees the order with table 4', list.status === 200 && Array.isArray(list.json) && list.json.some(o => o.table === '4'));

  console.log('\nTable and swaps');
  const junk = await call('POST', `/api/r/${slug}/orders`, { ...orderFor(dish, 169), table: '"><img src=x onerror=alert(1)>' });
  check('junk table value is stored as "no table"', junk.status === 201 && junk.json && junk.json.table === null, `status ${junk.status}, table ${junk.json && junk.json.table}`);
  const curry = { name: 'Test Curry', mode: 'B', basePrice: 200, category: 'Curries', image: null, removalRefund: false, dietary: 'veg', jainFriendly: false,
    ingredients: [{ id: 'c1', name: 'Paneer', allergens: ['Dairy'], swappable: true, swapOptions: [{ label: 'Paneer', price: 0 }, { label: 'Tofu', price: 40 }] }], modifiers: [] };
  const cd = (await call('POST', '/api/dishes', curry, true)).json;
  const swapOrder = (price) => ({ table: '4', items: [{ dishId: cd.id, dishName: cd.name, price, config: [{ index: 0, swapChoice: 1 }], modifierChoices: {}, mods: [], deltas: [] }] });
  const okSwap = await call('POST', `/api/r/${slug}/orders`, swapOrder(240));
  check('swap to Tofu is priced correctly (240)', okSwap.status === 201 && okSwap.json.total === 240, `status ${okSwap.status}`);
  const badSwap = await call('POST', `/api/r/${slug}/orders`, swapOrder(200));
  check('swap with the old price is rejected (409)', badSwap.status === 409, `status ${badSwap.status}`);

  console.log('\nLive updates');
  const noStream = await call('GET', '/api/orders/stream');
  check('live stream needs login (401)', noStream.status === 401, `status ${noStream.status}`);
  const ctl = new AbortController();
  const sres = await fetch(BASE + '/api/orders/stream', { headers: { Cookie: cookie }, signal: ctl.signal });
  check('live stream opens for the owner', sres.status === 200 && (sres.headers.get('content-type') || '').includes('text/event-stream'), `status ${sres.status}`);
  const reader = sres.body.getReader(); const dec = new TextDecoder(); let buf = ''; let pending = null;
  const readFor = async (ms, until) => {
    const end = Date.now() + ms;
    while (Date.now() < end && !until(buf)) {
      if (!pending) pending = reader.read();
      const r = await Promise.race([pending, new Promise(res => setTimeout(() => res(null), 200))]);
      if (r) { pending = null; if (r.value) buf += dec.decode(r.value); if (r.done) break; }
    }
  };
  await readFor(1500, b => b.includes('event: hello'));
  const t0 = Date.now();
  await call('POST', `/api/r/${slug}/orders`, orderFor(dish, 169));
  await readFor(3000, b => b.includes('event: orders'));
  check('owner is told about a new order within 3 s', buf.includes('event: orders'), `waited ${Date.now() - t0} ms`);
  if (pending) pending.catch(() => {});
  ctl.abort();

  console.log('\nStatus flow');
  const prep = await call('PATCH', `/api/orders/${good.json.id}/status`, { status: 'preparing' }, true);
  check('owner can mark preparing', prep.status === 200 && prep.json.status === 'preparing');
  const seen = await call('GET', `/api/r/${slug}/orders/${good.json.id}/status`);
  check('customer sees "preparing"', seen.json && seen.json.status === 'preparing');
  const bad = await call('PATCH', `/api/orders/${good.json.id}/status`, { status: 'banana' }, true);
  check('invalid status is rejected (400)', bad.status === 400);

  console.log('\nSold out');
  const so = await call('PATCH', `/api/dishes/${dish.id}/soldout`, { soldOut: true }, true);
  check('owner can mark a dish sold out', so.status === 200, `status ${so.status}`);
  const blocked = await call('POST', `/api/r/${slug}/orders`, orderFor(dish, 169));
  check('sold-out dish cannot be ordered (409)', blocked.status === 409, `status ${blocked.status}`);
}

(async () => {
  const server = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT), DB_FILE: DB }, stdio: ['ignore', 'pipe', 'pipe'] });
  let up = false, log = '';
  server.stdout.on('data', d => { log += d; if (/running at/.test(log)) up = true; });
  server.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 50 && !up; i++) await new Promise(r => setTimeout(r, 100));
  if (!up) { console.log('FAIL  server did not start\n' + log); process.exit(1); }
  try { await run(); } catch (e) { failed++; console.log('  FAIL  test crashed: ' + e.message); }
  server.kill();
  for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
