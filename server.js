const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const DISHES_FILE = path.join(__dirname, 'data', 'dishes.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');

app.use(express.json({ limit: '12mb' }));
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

/* ---------- Dishes ---------- */

app.get('/api/dishes', (req, res) => {
  res.json(readJSON(DISHES_FILE, []));
});

app.post('/api/dishes', (req, res) => {
  const dishes = readJSON(DISHES_FILE, []);
  const dish = req.body;
  if (!dish.name || !dish.basePrice) {
    return res.status(400).json({ error: 'name and basePrice are required' });
  }
  dish.id = uid();
  dishes.push(dish);
  writeJSON(DISHES_FILE, dishes);
  res.status(201).json(dish);
});

app.put('/api/dishes/:id', (req, res) => {
  const dishes = readJSON(DISHES_FILE, []);
  const idx = dishes.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Dish not found' });
  const updated = { ...req.body, id: req.params.id };
  dishes[idx] = updated;
  writeJSON(DISHES_FILE, dishes);
  res.json(updated);
});

app.delete('/api/dishes/:id', (req, res) => {
  let dishes = readJSON(DISHES_FILE, []);
  const before = dishes.length;
  dishes = dishes.filter(d => d.id !== req.params.id);
  writeJSON(DISHES_FILE, dishes);
  res.json({ deleted: before - dishes.length });
});

/* ---------- Orders ---------- */

app.get('/api/orders', (req, res) => {
  res.json(readJSON(ORDERS_FILE, []));
});

app.post('/api/orders', (req, res) => {
  const orders = readJSON(ORDERS_FILE, []);
  const order = req.body;
  order.id = uid();
  order.time = new Date().toISOString();
  orders.push(order);
  writeJSON(ORDERS_FILE, orders);
  res.status(201).json(order);
});

app.listen(PORT, () => {
  console.log(`Layer menu app running at http://localhost:${PORT}`);
});
