/* Lock-screen notifications for the kitchen (web push). Free, no account, no bot.
   The owner presses "Turn on notifications on this device" in the Kitchen tab. The browser gives us a
   private address for that device; on every new order (and every 2 minutes while nobody has pressed
   Start preparing, up to 3 times) the server sends a message to it, and the phone shows it on the lock screen.
   Needs a secure address (https) except on localhost. On iPhone the page must be added to the Home Screen first.
   If anything here fails, ordering is never affected. */
const store = require('./db');
let webpush = null;
try { webpush = require('web-push'); } catch (e) { /* package not installed: feature stays off */ }

const REMIND_MS = Number(process.env.PUSH_REMINDER_MS) || 2 * 60 * 1000;
const MAX_REMINDERS = 3;
const MAX_DEVICES = 20;
const reminders = new Map(); // order id -> timer
let ready = false, publicKey = '';

function setup() {
  if (ready || !webpush) return ready;
  try {
    let pub = process.env.VAPID_PUBLIC_KEY || store.getKv('vapid_public');
    let priv = process.env.VAPID_PRIVATE_KEY || store.getKv('vapid_private');
    if (!pub || !priv) {
      const k = webpush.generateVAPIDKeys();
      pub = k.publicKey; priv = k.privateKey;
      store.setKv('vapid_public', pub); store.setKv('vapid_private', priv);
    }
    // Apple wants a real mailto: or https: contact. Set PUSH_CONTACT in .env before going live.
    webpush.setVapidDetails(process.env.PUSH_CONTACT || 'mailto:notify@explodish.app', pub, priv);
    publicKey = pub; ready = true;
  } catch (e) { console.warn('[push] could not start:', e.message); }
  return ready;
}

const tableLabel = o => (o.table ? `Table ${o.table}` : 'No table');
const numLabel = o => (o.number ? `#${o.number}` : '');

function newOrderPayload(order) {
  const names = (order.items || []).slice(0, 3).map(i => i.dishName).filter(Boolean);
  const more = (order.items || []).length > 3 ? ` +${order.items.length - 3} more` : '';
  return {
    title: `New order ${numLabel(order)} \u00b7 ${tableLabel(order)}`.replace(/\s+/g, ' ').trim(),
    body: `${names.join(', ')}${more} \u00b7 Rs ${order.total}`,
    tag: 'order-' + order.id, url: '/admin', orderId: order.id
  };
}
function reminderPayload(order, minutes) {
  return {
    title: `Not accepted yet \u00b7 ${tableLabel(order)}`,
    body: `Waiting ${minutes} min. Open Explodish and press Start preparing.`,
    tag: 'order-' + order.id, url: '/admin', orderId: order.id
  };
}

async function sendTo(subs, payload) {
  const body = JSON.stringify(payload);
  let sent = 0, failed = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 300, urgency: 'high', timeout: 10000 });
      sent++;
    } catch (e) {
      failed++;
      if (e && (e.statusCode === 404 || e.statusCode === 410)) store.removePushSub(s.endpoint); // the device unsubscribed
      else console.warn('[push] send failed:', (e && (e.statusCode || e.message)) || 'unknown');
    }
  }
  return { sent, failed };
}

function scheduleReminder(orderId, restaurantId, n) {
  const timer = setTimeout(async () => {
    reminders.delete(orderId);
    const o = store.getOrder(orderId);
    if (!o || o.restaurantId !== restaurantId || (o.status || 'new') !== 'new') return;
    const subs = store.listPushSubs(restaurantId);
    if (!subs.length) return;
    const mins = Math.round((REMIND_MS * n) / 60000 * 10) / 10;
    await sendTo(subs, reminderPayload(o, mins));
    if (n < MAX_REMINDERS) scheduleReminder(orderId, restaurantId, n + 1);
  }, REMIND_MS);
  if (timer.unref) timer.unref();
  reminders.set(orderId, timer);
}

function notifyNewOrder(order, restaurant) {
  try {
    if (!setup()) return;
    const subs = store.listPushSubs(restaurant.id);
    if (!subs.length) return;
    sendTo(subs, newOrderPayload(order)).catch(() => {});
    scheduleReminder(order.id, restaurant.id, 1);
  } catch (e) { console.warn('[push] notify failed:', e.message); }
}

function start() {
  if (!setup()) return;
  try {
    for (const rid of store.listPushRestaurants()) {
      for (const o of store.listOrders(rid)) {
        if ((o.status || 'new') === 'new' && Date.now() - new Date(o.time).getTime() < 30 * 60 * 1000) scheduleReminder(o.id, rid, 1);
      }
    }
    console.log('Lock-screen notifications available');
  } catch (e) { console.warn('[push] resume failed:', e.message); }
}

function validSub(s) {
  return s && typeof s === 'object' && typeof s.endpoint === 'string' && /^https:\/\/[^\s]{8,1900}$/.test(s.endpoint) &&
    s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string' &&
    s.keys.p256dh.length >= 20 && s.keys.p256dh.length <= 200 && s.keys.auth.length >= 8 && s.keys.auth.length <= 100;
}

function mount(app, { requireAuth, rateLimit }) {
  app.get('/api/push/status', requireAuth, (req, res) => {
    const on = setup();
    res.json({ enabled: on, publicKey: on ? publicKey : '', devices: on ? store.listPushSubs(req.restaurantId).length : 0 });
  });
  app.post('/api/push/subscribe', requireAuth, rateLimit(60, 10 * 60 * 1000), (req, res) => {
    if (!setup()) return res.status(503).json({ error: 'Notifications are not available on this server' });
    const s = req.body && req.body.subscription;
    if (!validSub(s)) return res.status(400).json({ error: 'That notification address is not valid' });
    const existing = store.listPushSubs(req.restaurantId);
    if (existing.length >= MAX_DEVICES && !existing.some(x => x.endpoint === s.endpoint)) {
      return res.status(409).json({ error: `Up to ${MAX_DEVICES} devices can be set up. Turn one off first.` });
    }
    const label = typeof req.body.label === 'string' ? req.body.label.slice(0, 80) : '';
    store.addPushSub(req.restaurantId, s.endpoint, s.keys.p256dh, s.keys.auth, label);
    res.json({ ok: true, devices: store.listPushSubs(req.restaurantId).length });
  });
  app.delete('/api/push/subscribe', requireAuth, (req, res) => {
    const ep = req.body && req.body.endpoint;
    if (typeof ep === 'string') store.removePushSubFor(req.restaurantId, ep);
    res.json({ ok: true, devices: store.listPushSubs(req.restaurantId).length });
  });
  app.post('/api/push/test', requireAuth, rateLimit(20, 10 * 60 * 1000), async (req, res) => {
    if (!setup()) return res.status(503).json({ error: 'Notifications are not available on this server' });
    const subs = store.listPushSubs(req.restaurantId);
    if (!subs.length) return res.status(409).json({ error: 'No device is set up yet' });
    const r = await sendTo(subs, { title: 'Test notification', body: 'If you can read this on your lock screen, new orders will reach you.', tag: 'explodish-test', url: '/admin' });
    res.json(r);
  });
}

module.exports = { mount, start, notifyNewOrder, newOrderPayload, reminderPayload, validSub, setup };
