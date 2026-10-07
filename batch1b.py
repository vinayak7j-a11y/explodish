#!/usr/bin/env python3
"""Explodish batch 1b: the server re-prices every order item from the saved menu,
so a changed phone request can no longer lower a price. Patches server.js and
public/app.js.  Run from the menu-app folder:  python3 batch1b.py
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

# ---------------- server.js ----------------
S = "server.js"

A = "/* ---------- Orders ---------- */"
patch(S, A, r"""/* Works out what one cart item should cost from the saved menu. Mirrors the
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

""" + A, "server: price calculator", "function priceItem")

A = "  order.table = order.table == null || order.table === '' ? null : String(order.table).slice(0, 20);"
patch(S, A, A + r"""

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
  }""", "server: re-price every order item", "code: 'menu_changed'")

# ---------------- public/app.js ----------------
P = "public/app.js"

patch(P, "CART.push({ dishName: dish.name, price: total, mods, deltas: deltas.filter(d=>!d.noChange) });",
      "CART.push({ dishName: dish.name, price: total, mods, deltas: deltas.filter(d=>!d.noChange),\n    dishId: dish.id, config: config.map(c=>({...c})), modifierChoices: {...modifierChoices} });",
      "app: cart items remember their dish and choices", "dishId: dish.id, config")

patch(P, "err.soldOut = body.soldOut;", "err.soldOut = body.soldOut;\n    err.code = body.code;", "app: read the 'menu changed' reply", "err.code = body.code")

patch(P, "else { toast('Could not reach the server — order not sent'); }",
      "else if(e.code==='menu_changed'){ CART = []; renderCartFab(); toast(e.message); refreshMenu(); }\n    else { toast('Could not reach the server — order not sent'); }",
      "app: friendly 'menu changed' message", "e.code==='menu_changed'")

patch(P, "Array.isArray(i.mods) && Array.isArray(i.deltas)).slice(0,50);",
      "Array.isArray(i.mods) && Array.isArray(i.deltas) && typeof i.dishId==='string' && Array.isArray(i.config)).slice(0,50);",
      "app: drop old saved carts that lack dish details", "typeof i.dishId==='string'")
