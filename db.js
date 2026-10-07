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
`);

const toRestaurant = r => r && ({
  id: r.id, slug: r.slug, name: r.name, email: r.email,
  passwordHash: r.password_hash, active: !!r.active, createdAt: r.created_at
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
  setOrderStatus: (id, rid, status) => {
    const row = q.ordById.get(String(id));
    if (!row || row.restaurant_id !== rid) return null;
    const data = JSON.stringify({ ...JSON.parse(row.data), status });
    q.updOrder.run(data, row.id, rid);
    return orderFromRow({ ...row, data });
  }
};
