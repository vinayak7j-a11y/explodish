// Telegram alert test: runs the app against a fake Telegram server (no internet, no real bot).
// Run with: npm test   (or: node test/telegram.js)
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}

// ---- fake Telegram ----
const sent = [];            // { chat_id, text }
let queue = [];             // updates waiting for getUpdates
let nextUpdateId = 1;
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    const method = req.url.split('/').pop();
    const data = body ? JSON.parse(body) : {};
    const reply = obj => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
    if (method === 'getMe') return reply({ ok: true, result: { username: 'ExplodishTestBot' } });
    if (method === 'deleteWebhook') return reply({ ok: true, result: true });
    if (method === 'sendMessage') { sent.push({ chat_id: String(data.chat_id), text: data.text }); return reply({ ok: true, result: {} }); }
    if (method === 'getUpdates') {
      for (let i = 0; i < 10 && !queue.length; i++) await sleep(100);
      const out = queue; queue = [];
      return reply({ ok: true, result: out });
    }
    reply({ ok: false, description: 'unknown method' });
  });
});
const pushStart = (chatId, text) => queue.push({ update_id: nextUpdateId++, message: { text, chat: { id: chatId, type: 'private' } } });

async function startApp(env) {
  const port = 4100 + Math.floor(Math.random() * 800);
  const db = path.join(os.tmpdir(), `explodish-tg-${process.pid}-${port}.db`);
  const proc = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(port), DB_FILE: db, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let up = false, log = '';
  proc.stdout.on('data', d => { log += d; if (/running at/.test(log)) up = true; });
  proc.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60 && !up; i++) await sleep(100);
  if (!up) { console.log('FAIL  server did not start\n' + log); process.exit(1); }
  return { port, proc, db, base: `http://localhost:${port}` };
}
function client(base) {
  let cookie = '';
  return async (method, url, body) => {
    const headers = {}; if (body !== undefined) headers['Content-Type'] = 'application/json'; if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: res.status, json };
  };
}
async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(100); } return false; }

(async () => {
  await new Promise(r => fake.listen(0, r));
  const fakeBase = `http://localhost:${fake.address().port}`;
  const app = await startApp({ TELEGRAM_BOT_TOKEN: 'TESTTOKEN', TELEGRAM_API_BASE: fakeBase, TELEGRAM_REMINDER_MS: '700', PUBLIC_URL: 'https://menu.example.test' });
  const api = client(app.base);
  const anon = client(app.base);
  console.log('\nTelegram alerts');

  const reg = await api('POST', '/api/auth/register', { name: 'Tele Cafe', email: `tg${Date.now()}@test.dev`, password: 'testpass123' });
  const slug = reg.json.slug;
  const dish = (await api('POST', '/api/dishes', {
    name: 'Tele Burger', mode: 'A', basePrice: 149, category: 'Burgers', image: null, removalRefund: false, dietary: 'veg', jainFriendly: false,
    ingredients: [
      { id: 'b1', name: 'Bun', included: true, mandatory: true, unitPrice: 0, maxQty: 1, allergens: [] },
      { id: 'b2', name: 'Lettuce', included: true, mandatory: false, unitPrice: 10, maxQty: 2, allergens: [] },
      { id: 'b4', name: 'Cheese slice', included: true, mandatory: false, unitPrice: 20, maxQty: 3, allergens: [] }
    ], modifiers: []
  })).json;
  const order = (table) => ({ table, items: [{ dishId: dish.id, dishName: dish.name, price: 169,
    config: [{ id: 'b1', qty: 1 }, { id: 'b2', qty: 0 }, { id: 'b4', qty: 2 }], modifierChoices: {}, mods: ['No Lettuce', '+1 Cheese slice'], deltas: [{ label: '+ Cheese slice', amount: 20, noChange: false }] }] });
  const place = async t => (await anon('POST', `/api/r/${slug}/orders`, order(t))).json;

  const anonStatus = await anon('GET', '/api/telegram/status');
  check('status needs login (401)', anonStatus.status === 401, `status ${anonStatus.status}`);
  const st0 = (await api('GET', '/api/telegram/status')).json;
  check('bot is on and not connected yet', st0.enabled === true && st0.connected === false && st0.botUsername === 'ExplodishTestBot', JSON.stringify(st0));

  const link = (await api('POST', '/api/telegram/link')).json;
  const m = link && /^https:\/\/t\.me\/ExplodishTestBot\?start=([A-Za-z0-9_-]{10,64})$/.exec(link.url || '');
  check('connect link is a t.me deep link with a one-time token', !!m, JSON.stringify(link));

  pushStart(777, '/start totally-wrong-token');
  check('a wrong or expired token gets an "expired" reply and links nothing',
    await waitFor(() => sent.some(s => s.chat_id === '777' && /expired/i.test(s.text)), 4000)
    && (await api('GET', '/api/telegram/status')).json.connected === false);

  pushStart(555, '/start ' + m[1]);
  check('pressing Start connects the restaurant', await waitFor(async () => (await api('GET', '/api/telegram/status')).json.connected === true, 4000));
  check('the phone gets a "Connected" message', sent.some(s => s.chat_id === '555' && /Connected/.test(s.text)));

  pushStart(888, '/start ' + m[1]);
  check('the same link cannot be used twice', await waitFor(() => sent.some(s => s.chat_id === '888' && /expired/i.test(s.text)), 4000));

  const o1 = await place('4');
  check('a new order is sent to the phone with table, items, changes and total',
    await waitFor(() => sent.some(s => s.chat_id === '555' && /New order - Table 4/.test(s.text) && /Tele Burger/.test(s.text) && /No Lettuce/.test(s.text) && /Rs 169/.test(s.text)), 3000),
    JSON.stringify(sent.slice(-2)));

  check('a reminder arrives if nobody accepts the order',
    await waitFor(() => sent.some(s => s.chat_id === '555' && /Not accepted yet: Table 4/.test(s.text)), 3000));

  const o2 = await place('9');
  await api('PATCH', `/api/orders/${o2.id}/status`, { status: 'preparing' });
  await sleep(2000);
  check('no reminder is sent for an order that was accepted', !sent.some(s => /Table 9 has been waiting/.test(s.text)));

  const before = sent.length;
  const t = await api('POST', '/api/telegram/test');
  check('"Send test message" reaches the phone', t.status === 200 && await waitFor(() => sent.length > before && /Test message/.test(sent[sent.length - 1].text), 3000), `status ${t.status}`);

  await api('PATCH', `/api/orders/${o1.id}/status`, { status: 'done' });
  await api('DELETE', '/api/telegram/link');
  check('disconnecting works', (await api('GET', '/api/telegram/status')).json.connected === false);
  const afterOff = sent.length;
  await place('5'); await sleep(1500);
  check('after disconnecting, new orders send nothing', sent.length === afterOff);

  const raw = await anon('POST', `/api/r/${slug}/orders`, order('6'));
  check('order placing never depends on Telegram (still 201)', raw.status === 201, `status ${raw.status}`);

  app.proc.kill();
  for (const f of [app.db, app.db + '-wal', app.db + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

  // ---- bot not configured: feature stays off ----
  const off = await startApp({ TELEGRAM_BOT_TOKEN: '' });
  const api2 = client(off.base);
  await api2('POST', '/api/auth/register', { name: 'Plain Cafe', email: `pl${Date.now()}@test.dev`, password: 'testpass123' });
  const st = (await api2('GET', '/api/telegram/status')).json;
  check('without a bot token the feature is off and says so', st.enabled === false && st.connected === false, JSON.stringify(st));
  const l2 = await api2('POST', '/api/telegram/link');
  check('connecting without a bot token is refused (503)', l2.status === 503, `status ${l2.status}`);
  off.proc.kill();
  for (const f of [off.db, off.db + '-wal', off.db + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

  fake.close();
  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL  test crashed: ' + e.message); process.exit(1); });
