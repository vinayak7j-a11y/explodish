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

  console.log('\nOrder progress (step 1.4)');
  const n1 = await call('POST', `/api/r/${slug}/orders`, orderFor(dish, 169));
  const n2 = await call('POST', `/api/r/${slug}/orders`, orderFor(dish, 169));
  check('orders get a friendly number that goes up', n1.json && n2.json && Number.isInteger(n1.json.number) && n2.json.number === n1.json.number + 1, JSON.stringify([n1.json && n1.json.number, n2.json && n2.json.number]));
  const st1 = await call('GET', `/api/r/${slug}/orders/${n1.json.id}/status`);
  check('status shows number, age and waiter time', st1.json && st1.json.number === n1.json.number && Number.isInteger(st1.json.ageSec) && st1.json.waiterAfterSec > 0 && st1.json.prepMinutes === null, JSON.stringify(st1.json));
  const setNo = await call('PUT', '/api/settings', { prepMinutes: 12 }, false);
  check('waiting time needs login (401)', setNo.status === 401, `status ${setNo.status}`);
  for (const badVal of [0, 500, 'abc', 2.5, true, '']) {
    const r = await call('PUT', '/api/settings', { prepMinutes: badVal }, true);
    check('waiting time ' + JSON.stringify(badVal) + ' is refused (400)', r.status === 400, `status ${r.status}`);
  }
  const setOk = await call('PUT', '/api/settings', { prepMinutes: 12 }, true);
  check('owner can set waiting time', setOk.status === 200 && setOk.json.prepMinutes === 12);
  const st2 = await call('GET', `/api/r/${slug}/orders/${n1.json.id}/status`);
  check('customer status shows the waiting time', st2.json && st2.json.prepMinutes === 12);
  const acc = await call('PATCH', `/api/orders/${n1.json.id}/status`, { status: 'preparing' }, true);
  const st3 = await call('GET', `/api/r/${slug}/orders/${n1.json.id}/status`);
  check('accepting an order starts its preparing clock', acc.status === 200 && st3.json.status === 'preparing' && Number.isInteger(st3.json.preparingAgeSec), JSON.stringify(st3.json));
  const clr = await call('PUT', '/api/settings', { prepMinutes: null }, true);
  check('owner can clear the waiting time', clr.status === 200 && clr.json.prepMinutes === null);

  console.log('\nMenu import');
  const imp = await call('POST', '/api/dishes', Object.assign({}, burger, { name: 'Imported Burger', needsReview: true }), true);
  check('a dish can be saved as "check ingredients"', (imp.status === 201 || imp.status === 200) && imp.json && imp.json.needsReview === true, `status ${imp.status}`);
  if (imp.json && imp.json.id) {
    const upd = await call('PUT', `/api/dishes/${imp.json.id}`, Object.assign({}, imp.json, { needsReview: false }), true);
    check('marking it checked clears the flag', upd.status === 200 && upd.json.needsReview === false, `status ${upd.status}`);
    await call('DELETE', `/api/dishes/${imp.json.id}`, undefined, true);
  }
  const nv = await call('POST', '/api/dishes', Object.assign({}, burger, { name: 'Chicken Burger' }), true);
  check('non-veg dish is refused (400)', nv.status === 400, `status ${nv.status}`);
  for (const [url, label] of [['/vendor/ocr/tesseract.min.js', 'photo reader script'], ['/vendor/ocr/worker.min.js', 'photo reader worker'], ['/vendor/ocr/core/tesseract-core-simd-lstm.wasm.js', 'photo reader engine'], ['/vendor/ocr/lang/eng.traineddata.gz', 'English text data']]) {
    const f = await fetch(BASE + url);
    check(label + ' is served', f.status === 200, `${url} status ${f.status}`);
  }

  console.log('\nDish artwork');
  const la = await fetch(BASE + '/layerart.js');
  check('new artwork script is served', la.status === 200 && /layerShapeV2/.test(await la.text()), `status ${la.status}`);
  const ix = await fetch(BASE + '/r/' + slug);
  check('customer page loads the artwork before app.js', /layerart\.js[\s\S]*app\.js/.test(await ix.text()));

  console.log('\nMenu preview');
  const pvp = await fetch(BASE + '/menupreview.js');
  check('preview script is served', pvp.status === 200 && /previewCardHtml/.test(await pvp.text()), `status ${pvp.status}`);
  const pvh = await fetch(BASE + '/r/' + slug + '?preview=1');
  check('preview page opens like the customer page', pvh.status === 200);
  check('only this site may frame the app', pvh.headers.get('x-frame-options') === 'SAMEORIGIN', String(pvh.headers.get('x-frame-options')));

  console.log('\nSafe retries (step 1.5)');
  const beforeN = (await call('GET', '/api/orders', undefined, true)).json.length;
  const cidA = 'retry-test-aaaa1111';
  const r1 = await call('POST', `/api/r/${slug}/orders`, Object.assign({}, orderFor(dish, 169), { clientId: cidA }));
  const r2 = await call('POST', `/api/r/${slug}/orders`, Object.assign({}, orderFor(dish, 169), { clientId: cidA }));
  check('first send is created (201)', r1.status === 201, `status ${r1.status}`);
  check('sending the same order again returns the first one (200, same id and number)', r2.status === 200 && r2.json.id === r1.json.id && r2.json.number === r1.json.number, JSON.stringify([r2.status, r2.json && r2.json.id, r1.json && r1.json.id]));
  const r3 = await call('POST', `/api/r/${slug}/orders`, Object.assign({}, orderFor(dish, 169), { clientId: 'retry-test-bbbb2222' }));
  check('a different attempt id makes a new order', r3.status === 201 && r3.json.id !== r1.json.id);
  const r4 = await call('POST', `/api/r/${slug}/orders`, Object.assign({}, orderFor(dish, 169), { clientId: 'x' }));
  const r5 = await call('POST', `/api/r/${slug}/orders`, Object.assign({}, orderFor(dish, 169), { clientId: 'x' }));
  check('a malformed attempt id is ignored (two orders, no crash)', r4.status === 201 && r5.status === 201 && r4.json.id !== r5.json.id);
  const afterN = (await call('GET', '/api/orders', undefined, true)).json.length;
  check('the kitchen got exactly 4 new orders, not 5 (the retry was not doubled)', afterN - beforeN === 4, `before ${beforeN}, after ${afterN}`);

  console.log('\nNotifications setup');
  const sw = await fetch(BASE + '/sw.js');
  check('service worker is served and never cached', sw.status === 200 && /no-cache/.test(sw.headers.get('cache-control') || '') && /push/.test(await sw.text()), `status ${sw.status}`);
  const mf = await fetch(BASE + '/manifest.webmanifest');
  check('app manifest is served', mf.status === 200 && /Explodish/.test(await mf.text()));
  const ps0 = await call('GET', '/api/push/status', undefined, false);
  check('notification status needs login (401)', ps0.status === 401, `status ${ps0.status}`);
  const ps1 = await call('GET', '/api/push/status', undefined, true);
  check('notifications are available and give a public key', ps1.status === 200 && ps1.json.enabled === true && ps1.json.publicKey.length > 60, JSON.stringify(ps1.json));

  console.log('\nRush controls (step 1.6)');
  const cidP = 'pause-test-aaaa1111';
  const rcPre = await call('POST', `/api/r/${slug}/orders`, Object.assign({}, orderFor(dish, 169), { clientId: cidP }));
  check('before the pause, orders work (201)', rcPre.status === 201, `status ${rcPre.status}`);
  check('pause needs login (401)', (await call('PUT', '/api/ordering', { paused: true }, false)).status === 401);
  check('pause must be true or false (400)', (await call('PUT', '/api/ordering', { paused: 'yes' }, true)).status === 400);
  const rcOn = await call('PUT', '/api/ordering', { paused: true }, true);
  check('the owner can pause ordering', rcOn.status === 200 && rcOn.json.paused === true);
  const rcPub = await call('GET', `/api/r/${slug}`, undefined, false);
  check('customers can see that ordering is paused', rcPub.json.orderingPaused === true, JSON.stringify(rcPub.json));
  const rcBlocked = await call('POST', `/api/r/${slug}/orders`, orderFor(dish, 169));
  check('a new order is refused while paused (409, ordering_paused)', rcBlocked.status === 409 && rcBlocked.json.code === 'ordering_paused', `status ${rcBlocked.status}`);
  const rcAgain = await call('POST', `/api/r/${slug}/orders`, Object.assign({}, orderFor(dish, 169), { clientId: cidP }));
  check('a retry of an order sent just before the pause still succeeds (200)', rcAgain.status === 200 && rcAgain.json.id === rcPre.json.id, `status ${rcAgain.status}`);
  const rcOff = await call('PUT', '/api/ordering', { paused: false }, true);
  check('the owner can resume ordering', rcOff.status === 200 && rcOff.json.paused === false);
  const rcResumed = await call('POST', `/api/r/${slug}/orders`, orderFor(dish, 169));
  check('orders work again after resuming (201)', rcResumed.status === 201, `status ${rcResumed.status}`);
  check('pause state is readable by the owner', (await call('GET', '/api/ordering', undefined, true)).json.paused === false);

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
