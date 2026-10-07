#!/usr/bin/env python3
"""Explodish batch 1: safer orders, saved cart, customer order status, fresher menu,
delete confirmation, real 'today' numbers. Patches db.js, server.js, public/app.js.
Run from the menu-app folder:  python3 batch1.py
Prints [OK]/[SKIP] per change. Safe to re-run."""

def read(p): return open(p, encoding='utf-8').read()
def write(p, s): open(p, 'w', encoding='utf-8').write(s)

def patch(path, anchor, new, label, marker):
    s = read(path)
    if marker in s:
        print(f"[SKIP] {label}: already applied"); return
    if s.count(anchor) != 1:
        print(f"[SKIP] {label}: anchor found {s.count(anchor)} times (need exactly 1), no changes made"); return
    write(path, s.replace(anchor, new, 1)); print(f"[OK] {label}")

# ---------------- db.js ----------------
patch("db.js", "  setOrderStatus: (id, rid, status) => {",
      "  getOrder: id => { const r = q.ordById.get(String(id)); return r ? orderFromRow(r) : null; },\n  setOrderStatus: (id, rid, status) => {",
      "db: look up one order", "getOrder:")

# ---------------- server.js ----------------
S = "server.js"
A = "  const order = cleanValue(req.body, 0, { maxDepth: 8, maxStr: 500, maxArr: 200 });"
patch(S, A, A + r"""
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
  order.table = order.table == null || order.table === '' ? null : String(order.table).slice(0, 20);""",
      "server: validate and tidy incoming orders", "Your order is empty")

A = "app.get('/api/orders', requireAuth, (req, res) => {"
patch(S, A, """/* A customer can check how their own order is going (no login; needs the order's random id). */
app.get('/api/r/:slug/orders/:id/status', rateLimit(200, 10 * 60 * 1000), (req, res) => {
  const restaurant = activeBySlug(req.params.slug);
  const order = restaurant && store.getOrder(req.params.id);
  if (!order || order.restaurantId !== restaurant.id) return res.status(404).json({ error: 'Order not found' });
  res.json({ status: order.status || 'new' });
});

""" + A, "server: customer order-status endpoint", "orders/:id/status', rateLimit")

# ---------------- public/app.js ----------------
P = "public/app.js"

patch(P, "let CART = [];", "let CART = loadCart(); // restored from this phone if the page was refreshed", "app: restore saved cart", "loadCart();")

patch(P, "function renderCartFab(){", "function renderCartFab(){\n  saveCart();", "app: save cart on every change", "saveCart();\n")

patch(P, "async function placeOrder(){", """let placingOrder = false;
async function placeOrder(){
  if(placingOrder || !CART.length) return;
  placingOrder = true;
  const btn = document.getElementById('placeOrderBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Sending…'; }
  try{ await placeOrderNow(); }
  finally{
    placingOrder = false;
    if(btn && document.body.contains(btn)){ btn.disabled = false; btn.textContent = 'Place order'; }
  }
}
async function placeOrderNow(){""", "app: stop double orders", "placeOrderNow")

patch(P, "ORDERS.push(saved);", "ORDERS.push(saved);\n    if(saved && saved.id) trackMyOrder(saved.id);", "app: track the customer's order", "trackMyOrder(saved.id)")

patch(P, "await apiDeleteDish(id);",
      "if(!confirm('Delete \"' + ((DISHES.find(d=>d.id===id)||{}).name || 'this dish') + '\" for good?')) return;\n        await apiDeleteDish(id);",
      "app: ask before deleting a dish", "for good?')) return;")

patch(P, "const totalOrders = ORDERS.length;",
      "const todayStr = new Date().toDateString();\n  const todayOrders = ORDERS.filter(o=> new Date(o.time).toDateString()===todayStr);\n  const totalOrders = todayOrders.length;",
      "app: 'today' numbers count only today", "todayOrders")
patch(P, "const totalRevenue = ORDERS.reduce((s,o)=>s+o.total,0);", "const totalRevenue = todayOrders.reduce((s,o)=>s+o.total,0);", "app: today's revenue", "todayOrders.reduce((s,o)=>s+o.total")
patch(P, "const totalUpsell = ORDERS.reduce((s,o)=>s+o.upsell,0);", "const totalUpsell = todayOrders.reduce((s,o)=>s+o.upsell,0);", "app: today's add-on revenue", "todayOrders.reduce((s,o)=>s+o.upsell")
patch(P, "Live numbers from every order placed so far.", "Orders placed today, counted from midnight.", "app: honest 'today' caption", "counted from midnight")

EXTRA = r'''

/* ---------- Customer conveniences: saved cart, order status, fresh menu ---------- */
function cartSlug(){ const m = /^\/r\/([^\/?#]+)/.exec(location.pathname); return m ? m[1] : null; }
function loadCart(){
  try{
    const slug = cartSlug(); if(!slug) return [];
    const raw = JSON.parse(localStorage.getItem('explodish-cart:'+slug) || 'null');
    if(!raw || Date.now() - raw.t > 12*3600*1000 || !Array.isArray(raw.items)) return [];
    return raw.items.filter(i=> i && typeof i.dishName==='string' && Number.isFinite(i.price) && Array.isArray(i.mods) && Array.isArray(i.deltas)).slice(0,50);
  }catch(e){ return []; }
}
function saveCart(){
  try{
    const slug = cartSlug(); if(!slug) return;
    if(CART.length) localStorage.setItem('explodish-cart:'+slug, JSON.stringify({ t:Date.now(), items:CART }));
    else localStorage.removeItem('explodish-cart:'+slug);
  }catch(e){}
}

var STATUS_TEXT = { new:'Order received', preparing:'Being prepared', ready:'Ready!', done:'Served. Enjoy your meal!' };
var orderPoll = null;
function ordersKey(){ return 'explodish-orders:' + cartSlug(); }
function myOrders(){
  try{ return JSON.parse(localStorage.getItem(ordersKey()) || '[]').filter(o=> Date.now()-o.t < 3*3600*1000).slice(-3); }
  catch(e){ return []; }
}
function saveMyOrders(list){ try{ localStorage.setItem(ordersKey(), JSON.stringify(list.slice(-3))); }catch(e){} }
function forgetOrder(id){ saveMyOrders(myOrders().filter(o=>o.id!==id)); }
function showOrderBanner(id, status){
  let b = document.getElementById('orderBanner');
  if(!b){
    b = document.createElement('div');
    b.id = 'orderBanner';
    b.setAttribute('role','status');
    b.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 10px);z-index:9999;max-width:520px;margin:0 auto;padding:10px 14px;border-radius:12px;background:var(--paper);color:var(--ink);box-shadow:var(--lift-2);font:600 14px var(--font-body);display:flex;gap:10px;align-items:center;justify-content:space-between;';
    document.body.appendChild(b);
  }
  b.textContent = '';
  const t = document.createElement('span');
  t.textContent = 'Order ' + id.slice(0,4).toUpperCase() + ' · ' + (STATUS_TEXT[status] || status);
  const x = document.createElement('button');
  x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label','Dismiss');
  x.style.cssText = 'border:0;background:transparent;color:inherit;font-size:16px;padding:4px 8px;';
  x.addEventListener('click', ()=>{ forgetOrder(id); b.remove(); });
  b.append(t, x);
  b.dataset.until = status==='done' ? String(Date.now()+20000) : '0';
}
async function pollMyOrders(){
  const slug = cartSlug(), list = myOrders();
  const b = document.getElementById('orderBanner');
  if(!slug || !list.length){ if(b && Number(b.dataset.until||0) < Date.now()) b.remove(); return; }
  const last = list[list.length-1];
  try{
    const r = await fetch('/api/r/' + slug + '/orders/' + last.id + '/status');
    if(r.status===404){ forgetOrder(last.id); return pollMyOrders(); }
    if(!r.ok) return;
    const data = await r.json();
    showOrderBanner(last.id, data.status);
    if(data.status==='done') forgetOrder(last.id);
  }catch(e){ /* offline: try again next tick */ }
}
function startOrderPoll(){
  if(orderPoll) return;
  orderPoll = setInterval(()=>{ if(!document.hidden) pollMyOrders(); }, 8000);
}
function trackMyOrder(id){
  const list = myOrders(); list.push({ id, t:Date.now() }); saveMyOrders(list);
  startOrderPoll(); pollMyOrders();
}

async function refreshMenu(){
  if(!cartSlug() || document.hidden) return;
  try{
    const fresh = await apiGetPublicDishes(PUBLIC_SLUG);
    if(!fresh.length) return; // a failed request looks empty; keep what we have
    const sig = a => JSON.stringify(a.map(d=>[d.id, d.name, d.basePrice, !!d.soldOut, d.image ? 1 : 0]));
    if(sig(fresh) === sig(DISHES)) return;
    DISHES = fresh;
    if(!document.getElementById('closeDetail')) renderCustomerPage(); // don't disturb a dish someone is customising
  }catch(e){}
}
function startCustomerBackground(){
  if(!cartSlug()) return;
  setInterval(refreshMenu, 45000);
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden){ refreshMenu(); pollMyOrders(); } });
  if(myOrders().length){ startOrderPoll(); pollMyOrders(); }
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startCustomerBackground);
else startCustomerBackground();
'''
s = read(P)
if "function startCustomerBackground" in s:
    print("[SKIP] app: saved cart / order status / fresh menu code: already applied")
else:
    write(P, s.rstrip('\n') + '\n' + EXTRA); print("[OK] app: saved cart / order status / fresh menu code")
