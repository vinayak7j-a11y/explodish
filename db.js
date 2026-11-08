/* Explodish storage layer (SQLite). Same data shapes as the old JSON files,
   so the API and frontend are unchanged. Dishes and orders are stored as
   JSON documents with an indexed restaurant_id column. */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(process.env.DB_FILE || path.join(DATA_DIR, 'explodish.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dishes (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dishes_rest ON dishes(restaurant_id);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  time TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_rest ON orders(restaurant_id);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, label TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subs_restaurant ON push_subscriptions (restaurant_id);
CREATE TABLE IF NOT EXISTS telegram_links (
  restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id),
  chat_id TEXT NOT NULL,
  linked_at TEXT NOT NULL
);
`);

/* step 1.4: prep time setting (idempotent migration) */
if (!db.prepare('PRAGMA table_info(restaurants)').all().some(c => c.name === 'prep_minutes')) {
  db.exec('ALTER TABLE restaurants ADD COLUMN prep_minutes INTEGER');
}

/* step 1.6: pause switch (idempotent migration) */
if (!db.prepare('PRAGMA table_info(restaurants)').all().some(c => c.name === 'ordering_paused')) {
  db.exec('ALTER TABLE restaurants ADD COLUMN ordering_paused INTEGER NOT NULL DEFAULT 0');
}

const toRestaurant = r => r && ({
  id: r.id, slug: r.slug, name: r.name, email: r.email,
  passwordHash: r.password_hash, active: !!r.active, orderingPaused: !!r.ordering_paused, createdAt: r.created_at
});

const q = {
  countRest: db.prepare('SELECT COUNT(*) AS c FROM restaurants'),
  restById: db.prepare('SELECT * FROM restaurants WHERE id = ?'),
  restByEmail: db.prepare('SELECT * FROM restaurants WHERE email = ?'),
  restBySlug: db.prepare('SELECT * FROM restaurants WHERE slug = ?'),
  insRest: db.prepare('INSERT INTO restaurants (id, slug, name, email, password_hash, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  dishesFor: db.prepare('SELECT id, restaurant_id, data FROM dishes WHERE restaurant_id = ? ORDER BY rowid'),
  dishById: db.prepare('SELECT id, restaurant_id, data FROM dishes WHERE id = ?'),
  insDish: db.prepare('INSERT INTO dishes (id, restaurant_id, data) VALUES (?, ?, ?)'),
  updDish: db.prepare('UPDATE dishes SET data = ? WHERE id = ? AND restaurant_id = ?'),
  delDish: db.prepare('DELETE FROM dishes WHERE id = ? AND restaurant_id = ?'),
  insOrder: db.prepare('INSERT INTO orders (id, restaurant_id, time, data) VALUES (?, ?, ?, ?)'),
  ordersFor: db.prepare('SELECT id, restaurant_id, time, data FROM orders WHERE restaurant_id = ? ORDER BY rowid'),
  ordById: db.prepare('SELECT id, restaurant_id, time, data FROM orders WHERE id = ?'),
  updOrder: db.prepare('UPDATE orders SET data = ? WHERE id = ? AND restaurant_id = ?')
};

const dishFromRow = r => ({ ...JSON.parse(r.data), id: r.id, restaurantId: r.restaurant_id });
const orderFromRow = r => ({ ...JSON.parse(r.data), id: r.id, restaurantId: r.restaurant_id, time: r.time });

function slugify(name) {
  return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'restaurant';
}

/* Creates a restaurant; returns null if the email is already taken.
   Email check + slug choice + insert run in one transaction. */
const createRestaurant = db.transaction(({ id, name, email, passwordHash, active = true, createdAt }) => {
  if (q.restByEmail.get(email)) return null;
  const base = slugify(name);
  let slug = base, n = 2;
  while (q.restBySlug.get(slug)) { slug = `${base}-${n}`; n++; }
  q.insRest.run(id, slug, name, email, passwordHash, active ? 1 : 0, createdAt);
  return toRestaurant(q.restById.get(id));
});

/* One-time import of the old data/*.json files, only when the database is empty.
   The JSON files are left untouched as a fallback. */
function importLegacyJson() {
  if (q.countRest.get().c > 0) return;
  const read = f => {
    try { const v = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  };
  const rests = read('restaurants.json');
  if (!rests.length) return;
  const dishes = read('dishes.json');
  const orders = read('orders.json');
  const ids = new Set(rests.map(r => r.id));
  let skipped = 0, nd = 0, no = 0;
  db.transaction(() => {
    rests.forEach(r => q.insRest.run(r.id, r.slug, r.name, r.email, r.passwordHash, r.active === false ? 0 : 1, r.createdAt || new Date().toISOString()));
    dishes.forEach(d => { if (d && ids.has(d.restaurantId) && d.id) { q.insDish.run(d.id, d.restaurantId, JSON.stringify(d)); nd++; } else skipped++; });
    orders.forEach(o => { if (o && ids.has(o.restaurantId) && o.id) { q.insOrder.run(o.id, o.restaurantId, o.time || new Date().toISOString(), JSON.stringify(o)); no++; } else skipped++; });
  })();
  console.log(`Imported legacy JSON data: ${rests.length} restaurants, ${nd} dishes, ${no} orders` + (skipped ? ` (${skipped} skipped: no matching restaurant)` : ''));
}
importLegacyJson();

module.exports = {
  restaurantCount: () => q.countRest.get().c,
  findById: id => toRestaurant(q.restById.get(String(id))),
  findByEmail: email => toRestaurant(q.restByEmail.get(email)),
  findBySlug: slug => toRestaurant(q.restBySlug.get(String(slug))),
  createRestaurant,
  listDishes: rid => q.dishesFor.all(rid).map(dishFromRow),
  getDish: id => { const r = q.dishById.get(String(id)); return r ? dishFromRow(r) : null; },
  insertDish: d => q.insDish.run(d.id, d.restaurantId, JSON.stringify(d)),
  updateDish: d => q.updDish.run(JSON.stringify(d), d.id, d.restaurantId).changes,
  deleteDish: (id, rid) => q.delDish.run(String(id), rid).changes,
  insertOrder: o => q.insOrder.run(o.id, o.restaurantId, o.time, JSON.stringify(o)),
  listOrders: rid => q.ordersFor.all(rid).map(orderFromRow),
  getOrder: id => { const r = q.ordById.get(String(id)); return r ? orderFromRow(r) : null; },
  getKv: k => { const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(k); return r ? r.value : null; },
  setKv: (k, v) => db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v)),
  addPushSub: (rid, endpoint, p256dh, auth, label) => db.prepare('INSERT INTO push_subscriptions (endpoint, restaurant_id, p256dh, auth, label, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET restaurant_id = excluded.restaurant_id, p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label').run(endpoint, rid, p256dh, auth, label || '', new Date().toISOString()),
  listPushSubs: rid => db.prepare('SELECT endpoint, p256dh, auth, label FROM push_subscriptions WHERE restaurant_id = ?').all(rid),
  removePushSub: endpoint => db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint),
  removePushSubFor: (rid, endpoint) => db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND restaurant_id = ?').run(endpoint, rid),
  listPushRestaurants: () => db.prepare('SELECT DISTINCT restaurant_id FROM push_subscriptions').all().map(r => r.restaurant_id),
  getTelegramChat: rid => { const r = db.prepare('SELECT chat_id FROM telegram_links WHERE restaurant_id = ?').get(rid); return r ? r.chat_id : null; },
  setTelegramChat: (rid, chatId) => db.prepare('INSERT INTO telegram_links (restaurant_id, chat_id, linked_at) VALUES (?, ?, ?) ON CONFLICT(restaurant_id) DO UPDATE SET chat_id = excluded.chat_id, linked_at = excluded.linked_at').run(rid, String(chatId), new Date().toISOString()),
  clearTelegramChat: rid => db.prepare('DELETE FROM telegram_links WHERE restaurant_id = ?').run(rid),
  listTelegramRestaurants: () => db.prepare('SELECT restaurant_id FROM telegram_links').all().map(r => r.restaurant_id),
  /* Retry safety: the order we already stored for this attempt id (last 24 hours), or null. */
  findOrderByClientId: (rid, cid) => {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const rows = db.prepare('SELECT data FROM orders WHERE restaurant_id = ? AND time >= ? AND data LIKE ?')
      .all(rid, since, '%"clientId":"' + cid + '"%');
    for (const r of rows) { const o = JSON.parse(r.data); if (o.clientId === cid) return o; }
    return null;
  },
  getOrderingPaused: rid => { const r = db.prepare('SELECT ordering_paused FROM restaurants WHERE id = ?').get(rid); return !!(r && r.ordering_paused); },
  setOrderingPaused: (rid, on) => db.prepare('UPDATE restaurants SET ordering_paused = ? WHERE id = ?').run(on ? 1 : 0, rid),
  getPrepMinutes: rid => { const r = db.prepare('SELECT prep_minutes FROM restaurants WHERE id = ?').get(rid); return r && r.prep_minutes ? r.prep_minutes : null; },
  setPrepMinutes: (rid, n) => db.prepare('UPDATE restaurants SET prep_minutes = ? WHERE id = ?').run(n, rid),
  /* Friendly order number: 1, 2, 3 ... restarting each day (in the report time zone). */
  nextOrderNumber: (rid, tz) => {
    const day = t => new Date(t).toLocaleDateString('en-CA', { timeZone: tz });
    const today = day(Date.now());
    const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    const rows = db.prepare('SELECT time, data FROM orders WHERE restaurant_id = ? AND time >= ?').all(rid, since)
      .filter(r => day(r.time) === today)
      .filter(r => { try { return !JSON.parse(r.data).test; } catch (e) { return true; } }); // practice orders do not take a number
    let max = 0;
    for (const r of rows) { const n = Number(JSON.parse(r.data).number); if (n > max) max = n; }
    return Math.max(max, rows.length) + 1;
  },
  setOrderStatus: (id, rid, status) => {
    const row = q.ordById.get(String(id));
    if (!row || row.restaurant_id !== rid) return null;
    const prev = JSON.parse(row.data);
    const next = { ...prev, status };
    const stamp = new Date().toISOString();
    if (status === 'preparing' && !prev.preparingAt) next.preparingAt = stamp;
    if (status === 'ready' && !prev.readyAt) next.readyAt = stamp;
    const data = JSON.stringify(next);
    q.updOrder.run(data, row.id, rid);
    return orderFromRow({ ...row, data });
  }
};
