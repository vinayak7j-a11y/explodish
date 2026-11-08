// Lock-screen notifications (web push) test. No internet needed: the push service is replaced by a recorder.
// Run with: node test/push.js (also part of npm test)
const path = require('path'), os = require('os'), fs = require('fs'), crypto = require('crypto');
process.env.DB_FILE = path.join(os.tmpdir(), 'explodish-push-test-' + process.pid + '.db');
process.env.PUSH_REMINDER_MS = '150';
const express = require('express');
const webpush = require('web-push');
const store = require('../db');
const push = require('../push');

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function fakeSub(n) {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  return { endpoint: 'https://push.example.test/send/' + n, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(crypto.randomBytes(16)) } };
}

(async () => {
  console.log('\nLock-screen notifications');
  store.createRestaurant({ id: 'r-one', slug: 'push-test', name: 'Push Test', email: 'push@test.dev', passwordHash: 'x', createdAt: new Date().toISOString() });
  const calls = []; let nextError = null;
  webpush.sendNotification = async (sub, body, opts) => {
    calls.push({ endpoint: sub.endpoint, payload: JSON.parse(body), opts });
    if (nextError) { const e = new Error('push service said no'); e.statusCode = nextError; nextError = null; throw e; }
    return { statusCode: 201 };
  };

  const app = express(); app.use(express.json());
  const requireAuth = (req, res, next) => { req.restaurantId = req.get('x-rid') || 'r-one'; next(); };
  push.mount(app, { requireAuth, rateLimit: () => (q, s, n) => n() });
  const srv = app.listen(0); const B = 'http://localhost:' + srv.address().port;
  const api = (m, u, body, rid) => fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', 'x-rid': rid || 'r-one' }, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }));

  const st = await api('GET', '/api/push/status');
  check('status is on, gives the public key, 0 devices', st.status === 200 && st.json.enabled === true && st.json.publicKey.length > 60 && st.json.devices === 0, JSON.stringify(st.json));
  check('the same keys are reused after a restart', store.getKv('vapid_public') === st.json.publicKey);

  check('an http (not https) address is refused', (await api('POST', '/api/push/subscribe', { subscription: { endpoint: 'http://x.test/abc12345', keys: fakeSub(0).keys } })).status === 400);
  check('missing keys are refused', (await api('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://push.example.test/send/zz' } })).status === 400);
  check('junk is refused', (await api('POST', '/api/push/subscribe', { subscription: 'hello' })).status === 400);

  const s1 = fakeSub(1);
  const sub1 = await api('POST', '/api/push/subscribe', { subscription: s1, label: 'Kitchen tablet' });
  check('a device can be added', sub1.status === 200 && sub1.json.devices === 1, JSON.stringify(sub1.json));
  const sub1b = await api('POST', '/api/push/subscribe', { subscription: s1 });
  check('adding the same device twice keeps one', sub1b.json.devices === 1);
  check('another restaurant sees none of it', (await api('GET', '/api/push/status', null, 'r-two')).json.devices === 0);

  // new order -> notification
  const order = { id: 'ord1', restaurantId: 'r-one', time: new Date().toISOString(), status: 'new', table: '4', number: 7, total: 298, items: [{ dishName: 'Aloo Tikki Burger' }, { dishName: 'Paneer Wrap' }] };
  store.insertOrder(order);
  calls.length = 0;
  push.notifyNewOrder(order, { id: 'r-one' });
  await sleep(60);
  check('a new order sends one notification to the device', calls.length === 1 && calls[0].endpoint === s1.endpoint, JSON.stringify(calls.map(c => c.endpoint)));
  const p = calls[0] && calls[0].payload;
  check('it shows the number, table, dishes and total', p && /#7/.test(p.title) && /Table 4/.test(p.title) && /Aloo Tikki Burger/.test(p.body) && /298/.test(p.body), JSON.stringify(p));
  check('it is sent as urgent with a short life', calls[0] && calls[0].opts.urgency === 'high' && calls[0].opts.TTL === 300);
  await sleep(220);
  check('a reminder follows if nobody accepts the order', calls.length >= 2 && /Not accepted yet/.test(calls[calls.length - 1].payload.title), JSON.stringify(calls.map(c => c.payload.title)));
  check('the reminder replaces the first one (same tag)', calls[1] && calls[1].payload.tag === calls[0].payload.tag);

  check('a test order is clearly labelled in the notification', /TEST/.test(push.newOrderPayload({ id: 't1', test: true, table: 'TEST', items: [], total: 0 }).title));

  // accepted order: no more reminders
  const order2 = { id: 'ord2', restaurantId: 'r-one', time: new Date().toISOString(), status: 'new', table: '2', number: 8, total: 99, items: [{ dishName: 'Cheese Burger' }] };
  store.insertOrder(order2);
  await sleep(500); // let the first order's reminders finish
  calls.length = 0;
  push.notifyNewOrder(order2, { id: 'r-one' });
  await sleep(40);
  store.setOrderStatus('ord2', 'r-one', 'preparing');
  await sleep(400);
  check('no reminder for an accepted order (only the first notification)', calls.length === 1, 'got ' + calls.length);

  // errors
  nextError = 500;
  const order3 = { id: 'ord3', restaurantId: 'r-one', time: new Date().toISOString(), status: 'preparing', table: '1', number: 9, total: 50, items: [{ dishName: 'Tea' }] };
  store.insertOrder(order3); push.notifyNewOrder(order3, { id: 'r-one' }); await sleep(60);
  check('a push service error does not remove the device', (await api('GET', '/api/push/status')).json.devices === 1);
  nextError = 410;
  push.notifyNewOrder(order3, { id: 'r-one' }); await sleep(60);
  check('a device that unsubscribed (410) is removed', (await api('GET', '/api/push/status')).json.devices === 0);

  // test button, unsubscribe, isolation
  check('test button with no device says so (409)', (await api('POST', '/api/push/test')).status === 409);
  await api('POST', '/api/push/subscribe', { subscription: s1 });
  calls.length = 0;
  const t = await api('POST', '/api/push/test');
  check('test button sends to the device', t.status === 200 && t.json.sent === 1 && /Test notification/.test(calls[0].payload.title), JSON.stringify(t.json));
  await api('DELETE', '/api/push/subscribe', { endpoint: s1.endpoint }, 'r-two');
  check("another restaurant cannot remove this device", (await api('GET', '/api/push/status')).json.devices === 1);
  await api('DELETE', '/api/push/subscribe', { endpoint: s1.endpoint });
  check('the owner can turn a device off', (await api('GET', '/api/push/status')).json.devices === 0);

  // the real library accepts our keys and options (no network: only builds the request)
  const real = fakeSub(99);
  const det = webpush.generateRequestDetails(real, JSON.stringify({ title: 'x' }), { TTL: 300, urgency: 'high' });
  check('the real library builds a valid signed, encrypted request', det.method === 'POST' && /^vapid t=/.test(det.headers.Authorization) && Number(det.headers.TTL) === 300 && det.headers.Urgency === 'high' && Buffer.isBuffer(det.body) && det.body.length > 40, JSON.stringify(Object.keys(det.headers)));
  check('subscription checker accepts a good one and refuses a bad one', push.validSub(real) && !push.validSub({ endpoint: 'https://x', keys: {} }));

  srv.close();
  try { fs.rmSync(process.env.DB_FILE, { force: true }); fs.rmSync(process.env.DB_FILE + '-wal', { force: true }); fs.rmSync(process.env.DB_FILE + '-shm', { force: true }); } catch (e) {}
  console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + ': ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
