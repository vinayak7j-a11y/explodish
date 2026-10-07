const express = require('express');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const store = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

/* Change this in production — a committed default is fine for local/dev
   use, but anyone who can read this file can forge login tokens if it's
   still the default when this actually goes live. */
const DEV_SECRET = 'explodish-dev-secret-change-in-production';
const JWT_SECRET = process.env.JWT_SECRET || DEV_SECRET;
if (JWT_SECRET === DEV_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET must be set to a real secret in production.');
    process.exit(1);
  }
  console.warn('WARNING: using the insecure dev JWT secret. Set JWT_SECRET before deploying.');
}
const COOKIE_NAME = 'explodish_auth';
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10); // keeps login timing the same for unknown emails

/* ---------- Basic hardening ---------- */
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
});
app.use(cookieParser());
/* Dish routes carry base64 photos, so they get a big body limit, but only
   after the caller is logged in. Everything else is capped at 100kb. */
app.use('/api/dishes', requireAuth, express.json({ limit: '12mb' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* Tiny in-memory rate limiter (per IP + route). Set TRUST_PROXY=1 when
   deployed behind a proxy so the real client IP is used. */
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip + ' ' + req.path;
    const now = Date.now();
    let e = hits.get(key);
    if (!e || e.reset < now) { e = { count: 0, reset: now + windowMs }; hits.set(key, e); }
    e.count++;
    if (e.count > max) {
      res.set('Retry-After', String(Math.ceil((e.reset - now) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, e] of hits) if (e.reset < now) hits.delete(k); }, 60000).unref();

/* ---------- Helpers ---------- */
function uid() { return crypto.randomBytes(5).toString('hex'); }

function signToken(restaurantId) {
  return jwt.sign({ restaurantId }, JWT_SECRET, { expiresIn: '30d' });
}
function setAuthCookie(res, restaurantId) {
  res.cookie(COOKIE_NAME, signToken(restaurantId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

/* Every admin route goes through this — it's the entire boundary between
   "public menu visitor" and "logged-in restaurant owner". It also checks the
   restaurant still exists and is active, so deactivating an account (for
   billing, say) cuts off access immediately. Sets req.restaurantId. */
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (e) {
    return res.status(401).json({ error: 'Session expired — please log in again' });
  }
  const restaurant = store.findById(payload.restaurantId);
  if (!restaurant || !restaurant.active) return res.status(401).json({ error: 'Account not available' });
  req.restaurantId = restaurant.id;
  next();
}

// What the logged-in owner sees about their own account.
function ownerRestaurant(r) {
  return { id: r.id, slug: r.slug, name: r.name, email: r.email, active: r.active, createdAt: r.createdAt };
}
// What the public (customers scanning a QR code) sees. No email, no dates.
function customerRestaurant(r) {
  return { id: r.id, slug: r.slug, name: r.name, active: r.active };
}

/* Cleans untrusted JSON: only plain values, limited depth/size, no odd keys. */
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function cleanValue(v, depth, o) {
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') return v.slice(0, o.maxStr);
  if (depth >= o.maxDepth) return undefined;
  if (Array.isArray(v)) return v.slice(0, o.maxArr).map(x => cleanValue(x, depth + 1, o)).filter(x => x !== undefined);
  if (typeof v === 'object') {
    const out = {};
    Object.keys(v).slice(0, 40).forEach(k => {
      if (BAD_KEYS.has(k) || !/^[A-Za-z0-9_-]{1,40}$/.test(k)) return;
      const c = cleanValue(v[k], depth + 1, o);
      if (c !== undefined) out[k] = c;
    });
    return out;
  }
  return undefined;
}

/* Explodish is vegetarian-only: reject anything that names meat, fish or egg. */
const NONVEG_RE = /\b(chicken|mutton|lamb|beef|pork|bacon|ham|fish|prawns?|shrimps?|crabs?|lobsters?|squid|calamari|salmon|tuna|keema|kheema|eggs?|omelette|omelet|meat|sausages?|salami|pepperoni|gelatin|oysters?|mussels?|anchov(?:y|ies))\b/i;
function nonVegWord(text) {
  const t = String(text == null ? '' : text)
    .replace(/egg[- ]?(free|less)|meat[- ]?(free|less)|oyster mushrooms?/gi, ' ');
  const m = NONVEG_RE.exec(t);
  return m ? m[0] : null;
}
const IMG_RE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
function sanitizeDish(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Invalid dish' };
  const name = String(b.name || '').trim().slice(0, 80);
  const basePrice = Number(b.basePrice);
  if (!name) return { error: 'name and basePrice are required' };
  if (!Number.isFinite(basePrice) || basePrice <= 0 || basePrice > 100000) {
    return { error: 'name and basePrice are required (basePrice must be a positive number)' };
  }
  if (b.dietary && b.dietary !== 'veg') return { error: 'Only vegetarian dishes can be added to Explodish' };
  const badWord = [name, b.category]
    .concat(Array.isArray(b.ingredients) ? b.ingredients.slice(0, 60).map(i => i && i.name) : [])
    .map(nonVegWord).find(Boolean);
  if (badWord) return { error: '"' + badWord + '" is not vegetarian. Explodish only allows vegetarian dishes.' };
  let image = null;
  if (b.image) {
    if (typeof b.image !== 'string' || b.image.length > 4500000 || !IMG_RE.test(b.image)) {
      return { error: 'Photo must be a JPG, PNG, GIF or WebP image under 3MB' };
    }
    image = b.image;
  }
  const lim = { maxDepth: 4, maxStr: 200, maxArr: 60 };
  return {
    dish: {
      name,
      mode: b.mode === 'B' ? 'B' : 'A',
      basePrice,
      category: String(b.category || '').trim().slice(0, 40),
      image,
      removalRefund: !!b.removalRefund,
      dietary: 'veg',
      jainFriendly: !!b.jainFriendly,
      ingredients: Array.isArray(b.ingredients) ? cleanValue(b.ingredients, 0, lim) : [],
      modifiers: Array.isArray(b.modifiers) ? cleanValue(b.modifiers, 0, lim) : []
    }
  };
}

/* ---------- Auth ---------- */

app.post('/api/auth/register', rateLimit(10, 60 * 60 * 1000), async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are all required' });
  }
  if ([name, email, password].some(v => typeof v !== 'string')) {
    return res.status(400).json({ error: 'name, email, and password must be text' });
  }
  const cleanName = name.trim();
  const emailNorm = email.trim().toLowerCase();
  if (cleanName.length < 2 || cleanName.length > 80) {
    return res.status(400).json({ error: 'Restaurant name must be 2 to 80 characters' });
  }
  if (emailNorm.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (Buffer.byteLength(password) > 72) return res.status(400).json({ error: 'Password must be 72 bytes or fewer' });

  const passwordHash = await bcrypt.hash(password, 10);
  const restaurant = store.createRestaurant({
    id: uid(), name: cleanName, email: emailNorm, passwordHash,
    active: true, // self-serve for now — no billing gate yet, see PROJECT_CONTEXT.md
    createdAt: new Date().toISOString()
  });
  if (!restaurant) return res.status(409).json({ error: 'An account with that email already exists' });
  setAuthCookie(res, restaurant.id);
  res.status(201).json(ownerRestaurant(restaurant));
});

app.post('/api/auth/login', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password must be text' });
  }
  const restaurant = store.findByEmail(email.trim().toLowerCase());
  const ok = await bcrypt.compare(password, restaurant ? restaurant.passwordHash : DUMMY_HASH);
  if (!restaurant || !ok) return res.status(401).json({ error: 'Incorrect email or password' });
  if (!restaurant.active) return res.status(403).json({ error: 'This account is not active' });
  setAuthCookie(res, restaurant.id);
  res.json(ownerRestaurant(restaurant));
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(ownerRestaurant(store.findById(req.restaurantId)));
});

/* ---------- Dishes ---------- */
/* Two access paths: the public one a QR-scanning customer hits (read-only,
   scoped by restaurant slug, no login), and the admin one the owner tools
   UI uses (requires login, always scoped to the logged-in restaurant —
   there is no dish route that lets you touch another restaurant's menu). */

function activeBySlug(slug) {
  const r = store.findBySlug(slug);
  return r && r.active ? r : null;
}

app.get('/api/r/:slug', (req, res) => {
  const restaurant = activeBySlug(req.params.slug);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
  res.json(customerRestaurant(restaurant));
});

app.get('/api/r/:slug/dishes', (req, res) => {
  const restaurant = activeBySlug(req.params.slug);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
  res.json(store.listDishes(restaurant.id).filter(d => !d.dietary || d.dietary === 'veg')); // hide any old non-veg dishes
});

app.get('/api/dishes', requireAuth, (req, res) => {
  res.json(store.listDishes(req.restaurantId));
});

app.post('/api/dishes', requireAuth, (req, res) => {
  const { error, dish } = sanitizeDish(req.body);
  if (error) return res.status(400).json({ error });
  dish.id = uid();
  dish.restaurantId = req.restaurantId;
  store.insertDish(dish);
  res.status(201).json(dish);
});

app.put('/api/dishes/:id', requireAuth, (req, res) => {
  const existing = store.getDish(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Dish not found' });
  if (existing.restaurantId !== req.restaurantId) {
    return res.status(403).json({ error: 'Not your dish to edit' });
  }
  const { error, dish } = sanitizeDish(req.body);
  if (error) return res.status(400).json({ error });
  dish.id = existing.id;
  dish.soldOut = !!existing.soldOut; // only the sold-out switch changes this, never a normal edit
  dish.restaurantId = req.restaurantId;
  store.updateDish(dish);
  res.json(dish);
});

app.patch('/api/dishes/:id/soldout', requireAuth, (req, res) => {
  const existing = store.getDish(req.params.id);
  if (!existing || existing.restaurantId !== req.restaurantId) {
    return res.status(404).json({ error: 'Dish not found' });
  }
  if (!req.body || typeof req.body.soldOut !== 'boolean') {
    return res.status(400).json({ error: 'soldOut must be true or false' });
  }
  existing.soldOut = req.body.soldOut;
  store.updateDish(existing);
  res.json(existing);
});

app.delete('/api/dishes/:id', requireAuth, (req, res) => {
  const existing = store.getDish(req.params.id);
  if (existing && existing.restaurantId !== req.restaurantId) {
    return res.status(403).json({ error: 'Not your dish to delete' });
  }
  res.json({ deleted: existing ? store.deleteDish(req.params.id, req.restaurantId) : 0 });
});

/* Works out what one cart item should cost from the saved menu. Mirrors the
   price rules in the customer page. Returns null if the item doesn't fit the dish. */
function priceItem(dish, it) {
  if (!Array.isArray(it.config)) return null;
  const choices = it.modifierChoices && typeof it.modifierChoices === 'object' ? it.modifierChoices : {};
  const ings = Array.isArray(dish.ingredients) ? dish.ingredients : [];
  let total = Number(dish.basePrice);
  if (dish.mode === 'A') {
    for (const ing of ings) {
      const c = it.config.find(x => x && x.id === ing.id);
      if (!c || !Number.isInteger(c.qty) || c.qty < 0) return null;
      if (Number.isFinite(ing.maxQty) && c.qty > ing.maxQty) return null;
      if (ing.mandatory && c.qty < 1) return null;
      const diff = c.qty - (ing.included ? 1 : 0);
      const unit = Number(ing.unitPrice) || 0;
      total += diff >= 0 ? diff * unit : (dish.removalRefund ? diff * unit : 0);
    }
  } else {
    for (let i = 0; i < ings.length; i++) {
      const ing = ings[i];
      if (!ing.swappable) continue;
      const c = it.config.find(x => x && x.index === i);
      if (!c) return null;
      const opt = Array.isArray(ing.swapOptions) ? ing.swapOptions[c.swapChoice] : null;
      if (opt) total += Number(opt.price) || 0;
    }
  }
  for (const mod of dish.modifiers || []) {
    if (!Array.isArray(mod.options) || !mod.options.length) continue;
    const oi = choices[mod.id];
    if (!Number.isInteger(oi) || oi < 0 || oi >= mod.options.length) return null;
    total += Number(mod.options[oi].priceDelta) || 0;
  }
  return total;
}

/* ---------- Orders ---------- */

app.post('/api/r/:slug/orders', rateLimit(60, 10 * 60 * 1000), (req, res) => {
  const restaurant = activeBySlug(req.params.slug);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid order' });
  }
  const order = cleanValue(req.body, 0, { maxDepth: 8, maxStr: 500, maxArr: 200 });
  // The kitchen screen assumes a clean shape, so never store anything else.
  if (!Array.isArray(order.items) || order.items.length === 0 || order.items.length > 50) {
    return res.status(400).json({ error: 'Your order is empty' });
  }
  const itemsOk = order.items.every(it => it && typeof it.dishName === 'string' && it.dishName.trim() &&
    Number.isFinite(it.price) && it.price >= 0 && it.price < 100000);
  if (!itemsOk) return res.status(400).json({ error: 'One of the items in the order is invalid' });
  order.items.forEach(it => {
    it.mods = Array.isArray(it.mods) ? it.mods.filter(m => typeof m === 'string').slice(0, 30) : [];
    it.deltas = Array.isArray(it.deltas)
      ? it.deltas.filter(d => d && typeof d.label === 'string' && Number.isFinite(d.amount)).slice(0, 60)
      : [];
  });
  order.total = order.items.reduce((s, it) => s + it.price, 0); // the server adds it up, not the phone
  order.upsell = order.items.reduce((s, it) => s + it.deltas.reduce((a, d) => a + Math.max(d.amount, 0), 0), 0);
  order.table = order.table == null || order.table === '' ? null : String(order.table).slice(0, 20);

  // Re-price every item from the saved menu. The phone's price is never trusted.
  const menu = new Map(store.listDishes(restaurant.id).map(d => [d.id, d]));
  for (const it of order.items) {
    const dish = typeof it.dishId === 'string' ? menu.get(it.dishId) : null;
    const expected = dish ? priceItem(dish, it) : null;
    if (expected === null || Math.abs(expected - it.price) > 0.01) {
      return res.status(409).json({
        code: 'menu_changed',
        error: 'The menu changed while you were ordering. Please add your items again.'
      });
    }
    it.dishName = dish.name; // use our own dish name, not the phone's
  }
  // Refuse orders that contain a dish the owner has marked sold out.
  const soldOutDishes = store.listDishes(restaurant.id).filter(d => d.soldOut);
  if (soldOutDishes.length && Array.isArray(order.items)) {
    const ids = new Set(soldOutDishes.map(d => d.id));
    const names = new Set(soldOutDishes.map(d => d.name));
    const blocked = [...new Set(order.items
      .filter(it => it && (ids.has(it.dishId) || names.has(it.dishName)))
      .map(it => it.dishName || 'an item'))];
    if (blocked.length) return res.status(409).json({ error: 'Some items just sold out', soldOut: blocked });
  }
  if (JSON.stringify(order).length > 60000) return res.status(413).json({ error: 'Order is too large' });
  order.id = uid();
  order.restaurantId = restaurant.id;
  order.time = new Date().toISOString();
  order.status = 'new'; // always starts as new, whatever the client sent
  store.insertOrder(order);
  res.status(201).json(order);
});

app.patch('/api/orders/:id/status', requireAuth, (req, res) => {
  const status = req.body && req.body.status;
  if (!['new', 'preparing', 'ready', 'done', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const order = store.setOrderStatus(req.params.id, req.restaurantId, status);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

/* A customer can check how their own order is going (no login; needs the order's random id). */
app.get('/api/r/:slug/orders/:id/status', rateLimit(200, 10 * 60 * 1000), (req, res) => {
  const restaurant = activeBySlug(req.params.slug);
  const order = restaurant && store.getOrder(req.params.id);
  if (!order || order.restaurantId !== restaurant.id) return res.status(404).json({ error: 'Order not found' });
  res.json({ status: order.status || 'new' });
});

/* A customer can cancel their own order, but only before the kitchen starts it. */
app.post('/api/r/:slug/orders/:id/cancel', rateLimit(30, 10 * 60 * 1000), (req, res) => {
  const restaurant = activeBySlug(req.params.slug);
  const order = restaurant && store.getOrder(req.params.id);
  if (!order || order.restaurantId !== restaurant.id) return res.status(404).json({ error: 'Order not found' });
  const status = order.status || 'new';
  if (status === 'cancelled') return res.json({ status: 'cancelled' });
  if (status !== 'new') return res.status(409).json({ error: 'The kitchen has already started this order' });
  store.setOrderStatus(order.id, restaurant.id, 'cancelled');
  res.json({ status: 'cancelled' });
});

/* Order history as a spreadsheet file. Optional ?from= and ?to= (ISO timestamps). */
const REPORT_TZ = process.env.REPORT_TZ || 'Asia/Kolkata';
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stops spreadsheet formulas typed by customers from running
  return '"' + s.replace(/"/g, '""') + '"';
}
app.get('/api/orders.csv', requireAuth, (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  if ((from && isNaN(from)) || (to && isNaN(to))) return res.status(400).send('Invalid date');
  const rows = store.listOrders(req.restaurantId)
    .filter(o => (!from || new Date(o.time) >= from) && (!to || new Date(o.time) <= to));
  const lines = [['Order ID', 'Date', 'Time', 'Table', 'Status', 'Items', 'Total (INR)', 'Add-on revenue (INR)'].map(csvCell).join(',')];
  rows.forEach(o => {
    const d = new Date(o.time);
    const items = (o.items || []).map(it => it.dishName + (it.mods && it.mods.length ? ' (' + it.mods.join(', ') + ')' : '')).join(' | ');
    lines.push([
      o.id,
      d.toLocaleDateString('en-CA', { timeZone: REPORT_TZ }),
      d.toLocaleTimeString('en-GB', { timeZone: REPORT_TZ, hour12: false }),
      o.table || '', o.status || 'new', items, o.total, o.upsell
    ].map(csvCell).join(','));
  });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="explodish-orders.csv"');
  res.send('\ufeff' + lines.join('\r\n') + '\r\n');
});

app.get('/api/orders', requireAuth, (req, res) => {
  res.json(store.listOrders(req.restaurantId));
});

/* ---------- QR codes (table entry point) ---------- */
/* Renders a QR PNG for whatever URL the caller supplies — the frontend
   builds the actual table URL (using its own origin, so this works behind
   any proxy/domain without the server needing to guess its own address)
   and just asks this endpoint to turn it into a scannable image. */
app.get('/api/qr', async (req, res) => {
  const text = req.query.text;
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text query param is required' });
  if (text.length > 500) return res.status(400).json({ error: 'text is too long' });
  const size = Math.min(Math.max(parseInt(req.query.size) || 300, 100), 1000);
  try {
    const png = await QRCode.toBuffer(text, {
      type: 'png', width: size, margin: 1,
      color: { dark: '#241C15', light: '#FBF6E9' }
    });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(png);
  } catch (e) {
    res.status(500).json({ error: 'Could not generate QR code' });
  }
});

/* ---------- Client-side routes ---------- */
/* These paths aren't real files — express.static won't match them, so we
   explicitly hand back index.html and let the frontend JS decide what to
   render based on window.location. Everything under /r/:slug is the public
   customer menu; /admin is the owner login + dashboard. */
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/r/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ---------- Errors: always JSON, never a stack trace ---------- */
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

/* Dev convenience only: a fresh database gets the demo owner account. */
if (store.restaurantCount() === 0 && process.env.NODE_ENV !== 'production') {
  store.createRestaurant({
    id: 'rest-demo', name: 'Demo Kitchen', email: 'owner@demo.test',
    passwordHash: bcrypt.hashSync('demo12345', 10), active: true, createdAt: new Date().toISOString()
  });
  console.log('Created demo account: owner@demo.test / demo12345');
}

app.listen(PORT, () => {
  console.log(`Explodish menu app running at http://localhost:${PORT}`);
});
