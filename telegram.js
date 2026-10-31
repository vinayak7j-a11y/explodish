/* Telegram phone alerts (optional).
   Switched on only when TELEGRAM_BOT_TOKEN is set. The owner presses "Connect Telegram" in the
   Kitchen tab, opens the link, presses Start, and from then on every new order is sent to their
   phone, with a reminder every 2 minutes (up to 3 times) while nobody has accepted it.
   The server finds out about the Start press by asking Telegram for updates (long polling), so
   it works from a laptop with no public address. */
const crypto = require('crypto');
const store = require('./db');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API = (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
const REMIND_MS = Number(process.env.TELEGRAM_REMINDER_MS) || 2 * 60 * 1000;
const MAX_REMINDERS = 3;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const LINK_TTL_MS = 15 * 60 * 1000;

const enabled = !!TOKEN;
let botUsername = process.env.TELEGRAM_BOT_USERNAME || '';
const pending = new Map();   // link token -> { restaurantId, expires }
const reminders = new Map(); // order id -> timer
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function tg(method, body, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs || 15000);
  try {
    const r = await fetch(`${API}/bot${TOKEN}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}), signal: ctl.signal
    });
    return await r.json();
  } finally { clearTimeout(t); }
}

async function send(chatId, text) {
  try {
    const r = await tg('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
    if (!r || !r.ok) { console.warn('[telegram] send failed:', (r && r.description) || 'unknown error'); return false; }
    return true;
  } catch (e) { console.warn('[telegram] send failed:', e.message); return false; }
}

function adminUrl() { return PUBLIC_URL ? `${PUBLIC_URL}/admin` : 'your Explodish kitchen screen'; }

function orderLines(order) {
  const items = (order.items || []).slice(0, 8).map(it => {
    const mods = (it.mods || []).length ? ' (' + it.mods.join(', ') + ')' : '';
    return `- ${it.dishName}${mods}`;
  });
  if ((order.items || []).length > 8) items.push(`- and ${order.items.length - 8} more`);
  return items.join('\n');
}
const tableLabel = o => (o.table ? `Table ${o.table}` : 'No table');

function scheduleReminder(orderId, restaurantId, n) {
  const timer = setTimeout(async () => {
    reminders.delete(orderId);
    const o = store.getOrder(orderId);
    if (!o || o.restaurantId !== restaurantId || (o.status || 'new') !== 'new') return;
    const chat = store.getTelegramChat(restaurantId);
    if (!chat) return;
    const mins = Math.round((REMIND_MS * n) / 60000 * 10) / 10;
    await send(chat, `Not accepted yet: ${tableLabel(o)} has been waiting ${mins} min.\nOpen ${adminUrl()} and press Start preparing.`);
    if (n < MAX_REMINDERS) scheduleReminder(orderId, restaurantId, n + 1);
  }, REMIND_MS);
  if (timer.unref) timer.unref();
  reminders.set(orderId, timer);
}

function notifyNewOrder(order, restaurant) {
  if (!enabled) return;
  try {
    const chat = store.getTelegramChat(restaurant.id);
    if (!chat) return;
    send(chat, `New order - ${tableLabel(order)}\n${orderLines(order)}\nTotal Rs ${order.total}\nOpen ${adminUrl()}`);
    scheduleReminder(order.id, restaurant.id, 1);
  } catch (e) { console.warn('[telegram] notify failed:', e.message); }
}

async function handleUpdate(u) {
  const msg = u && u.message;
  if (!msg || !msg.text || !msg.chat) return;
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const m = /^\/start(?:@\w+)?\s+(\S+)$/.exec(text);
  if (!m) {
    if (/^\/start/.test(text)) await send(chatId, 'Hi! To get order alerts here, open Kitchen & dashboard in your Explodish admin and press "Connect Telegram".');
    return;
  }
  const p = pending.get(m[1]);
  if (!p || p.expires < Date.now()) {
    await send(chatId, 'That link has expired. Go back to Explodish and press "Connect Telegram" again.');
    return;
  }
  pending.delete(m[1]);
  store.setTelegramChat(p.restaurantId, chatId);
  const r = store.findById(p.restaurantId);
  await send(chatId, `Connected. You will get new-order alerts for ${r ? r.name : 'your restaurant'} here.`);
}

async function pollLoop() {
  let offset = 0;
  for (;;) {
    try {
      const res = await tg('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, 40000);
      if (!res || !res.ok) { console.warn('[telegram] getUpdates:', (res && res.description) || 'error'); await sleep(5000); continue; }
      for (const u of res.result) { offset = u.update_id + 1; await handleUpdate(u); }
    } catch (e) { await sleep(5000); }
  }
}

function resumeReminders() {
  try {
    for (const rid of store.listTelegramRestaurants()) {
      for (const o of store.listOrders(rid)) {
        if ((o.status || 'new') === 'new' && Date.now() - new Date(o.time).getTime() < 30 * 60 * 1000) scheduleReminder(o.id, rid, 1);
      }
    }
  } catch (e) { console.warn('[telegram] resume failed:', e.message); }
}

async function start() {
  if (!enabled) return;
  try {
    if (!botUsername) { const me = await tg('getMe'); if (me && me.ok) botUsername = me.result.username; }
    await tg('deleteWebhook', {});
  } catch (e) { console.warn('[telegram] could not reach Telegram yet:', e.message); }
  console.log(`Telegram alerts on${botUsername ? ' (bot @' + botUsername + ')' : ''}`);
  resumeReminders();
  pollLoop();
}

function mount(app, { requireAuth, rateLimit }) {
  app.get('/api/telegram/status', requireAuth, (req, res) => {
    res.json({ enabled, botUsername: enabled ? botUsername : '', connected: enabled && !!store.getTelegramChat(req.restaurantId) });
  });
  app.post('/api/telegram/link', requireAuth, rateLimit(20, 10 * 60 * 1000), async (req, res) => {
    if (!enabled) return res.status(503).json({ error: 'Phone alerts are not switched on for this server.' });
    if (!botUsername) {
      try { const me = await tg('getMe'); if (me && me.ok) botUsername = me.result.username; } catch (e) {}
      if (!botUsername) return res.status(503).json({ error: 'Could not reach Telegram. Try again in a minute.' });
    }
    for (const [k, v] of pending) { if (v.restaurantId === req.restaurantId || v.expires < Date.now()) pending.delete(k); }
    const token = crypto.randomBytes(12).toString('base64url');
    pending.set(token, { restaurantId: req.restaurantId, expires: Date.now() + LINK_TTL_MS });
    res.json({ url: `https://t.me/${botUsername}?start=${token}` });
  });
  app.post('/api/telegram/test', requireAuth, rateLimit(20, 10 * 60 * 1000), async (req, res) => {
    const chat = enabled && store.getTelegramChat(req.restaurantId);
    if (!chat) return res.status(409).json({ error: 'Telegram is not connected yet.' });
    const ok = await send(chat, 'Test message from Explodish. If you can read this, order alerts will reach you here.');
    if (!ok) return res.status(502).json({ error: 'Telegram did not accept the message.' });
    res.json({ ok: true });
  });
  app.delete('/api/telegram/link', requireAuth, (req, res) => {
    store.clearTelegramChat(req.restaurantId);
    res.json({ ok: true });
  });
}

module.exports = { enabled, start, mount, notifyNewOrder };
