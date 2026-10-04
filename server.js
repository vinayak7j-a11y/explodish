const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

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

const RESTAURANTS_FILE = path.join(__dirname, 'data', 'restaurants.json');
const DISHES_FILE = path.join(__dirname, 'data', 'dishes.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');

app.use(express.json({ limit: '12mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function readJSON(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function uid() {
  return crypto.randomBytes(5).toString('hex');
}
function slugify(name) {
  return String(name).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'restaurant';
}
function uniqueSlug(base, restaurants) {
  let slug = base, n = 2;
  while (restaurants.some(r => r.slug === slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  return slug;
}
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

/* Every admin route (owner tools, kitchen dashboard, dish mutations) goes
   through this — it's the entire boundary between "public menu visitor"
   and "logged-in restaurant owner". Attaches req.restaurantId on success. */
function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.restaurantId = payload.restaurantId;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired — please log in again' });
  }
}

function publicRestaurant(r) {
  // Never send the password hash (or anything else sensitive) to the client.
  return { id: r.id, slug: r.slug, name: r.name, email: r.email, active: r.active, createdAt: r.createdAt };
}

/* ---------- Auth ---------- */

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are all required' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const restaurants = readJSON(RESTAURANTS_FILE, []);
  const emailNorm = String(email).trim().toLowerCase();
  if (restaurants.some(r => r.email === emailNorm)) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const restaurant = {
    id: uid(),
    slug: uniqueSlug(slugify(name), restaurants),
    name: String(name).trim(),
    email: emailNorm,
    passwordHash,
    active: true, // self-serve for now — no billing gate yet, see PROJECT_CONTEXT.md
    createdAt: new Date().toISOString()
  };
  restaurants.push(restaurant);
  writeJSON(RESTAURANTS_FILE, restaurants);
  setAuthCookie(res, restaurant.id);
  res.status(201).json(publicRestaurant(restaurant));
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  const restaurants = readJSON(RESTAURANTS_FILE, []);
  const restaurant = restaurants.find(r => r.email === String(email).trim().toLowerCase());
  if (!restaurant) return res.status(401).json({ error: 'Incorrect email or password' });
  const ok = await bcrypt.compare(password, restaurant.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password' });
  setAuthCookie(res, restaurant.id);
  res.json(publicRestaurant(restaurant));
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const restaurants = readJSON(RESTAURANTS_FILE, []);
  const restaurant = restaurants.find(r => r.id === req.restaurantId);
  if (!restaurant) return res.status(401).json({ error: 'Account no longer exists' });
  res.json(publicRestaurant(restaurant));
});

/* ---------- Dishes ---------- */
/* Two access paths: the public one a QR-scanning customer hits (read-only,
   scoped by restaurant slug, no login), and the admin one the owner tools
   UI uses (requires login, always scoped to the logged-in restaurant —
   there is no dish route that lets you touch another restaurant's menu). */

app.get('/api/r/:slug', (req, res) => {
  const restaurants = readJSON(RESTAURANTS_FILE, []);
  const restaurant = restaurants.find(r => r.slug === req.params.slug && r.active);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
  res.json(publicRestaurant(restaurant));
});

app.get('/api/r/:slug/dishes', (req, res) => {
  const restaurants = readJSON(RESTAURANTS_FILE, []);
  const restaurant = restaurants.find(r => r.slug === req.params.slug && r.active);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
  const dishes = readJSON(DISHES_FILE, []).filter(d => d.restaurantId === restaurant.id);
  res.json(dishes);
});

app.get('/api/dishes', requireAuth, (req, res) => {
  const dishes = readJSON(DISHES_FILE, []).filter(d => d.restaurantId === req.restaurantId);
  res.json(dishes);
});

app.post('/api/dishes', requireAuth, (req, res) => {
  const dishes = readJSON(DISHES_FILE, []);
  const dish = req.body;
  if (!dish.name || !dish.basePrice) {
    return res.status(400).json({ error: 'name and basePrice are required' });
  }
  dish.id = uid();
  dish.restaurantId = req.restaurantId;
  dishes.push(dish);
  writeJSON(DISHES_FILE, dishes);
  res.status(201).json(dish);
});

app.put('/api/dishes/:id', requireAuth, (req, res) => {
  const dishes = readJSON(DISHES_FILE, []);
  const idx = dishes.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Dish not found' });
  if (dishes[idx].restaurantId !== req.restaurantId) {
    return res.status(403).json({ error: 'Not your dish to edit' });
  }
  const updated = { ...req.body, id: req.params.id, restaurantId: req.restaurantId };
  dishes[idx] = updated;
  writeJSON(DISHES_FILE, dishes);
  res.json(updated);
});

app.delete('/api/dishes/:id', requireAuth, (req, res) => {
  const dishes = readJSON(DISHES_FILE, []);
  const dish = dishes.find(d => d.id === req.params.id);
  if (dish && dish.restaurantId !== req.restaurantId) {
    return res.status(403).json({ error: 'Not your dish to delete' });
  }
  const remaining = dishes.filter(d => d.id !== req.params.id);
  writeJSON(DISHES_FILE, remaining);
  res.json({ deleted: dishes.length - remaining.length });
});

/* ---------- Orders ---------- */

app.post('/api/r/:slug/orders', (req, res) => {
  const restaurants = readJSON(RESTAURANTS_FILE, []);
  const restaurant = restaurants.find(r => r.slug === req.params.slug && r.active);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
  const orders = readJSON(ORDERS_FILE, []);
  const order = req.body;
  order.id = uid();
  order.restaurantId = restaurant.id;
  order.time = new Date().toISOString();
  orders.push(order);
  writeJSON(ORDERS_FILE, orders);
  res.status(201).json(order);
});

app.get('/api/orders', requireAuth, (req, res) => {
  const orders = readJSON(ORDERS_FILE, []).filter(o => o.restaurantId === req.restaurantId);
  res.json(orders);
});

/* ---------- QR codes (table entry point) ---------- */
/* Renders a QR PNG for whatever URL the caller supplies — the frontend
   builds the actual table URL (using its own origin, so this works behind
   any proxy/domain without the server needing to guess its own address)
   and just asks this endpoint to turn it into a scannable image. */
app.get('/api/qr', async (req, res) => {
  const text = req.query.text;
  if (!text) return res.status(400).json({ error: 'text query param is required' });
  const size = Math.min(Math.max(parseInt(req.query.size) || 300, 100), 1000);
  try {
    const png = await QRCode.toBuffer(String(text), {
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

app.listen(PORT, () => {
  console.log(`Explodish menu app running at http://localhost:${PORT}`);
});
