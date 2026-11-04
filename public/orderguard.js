/* Explodish step 1.5: failure-proof ordering (customer side).
   - one "attempt id" per order, so pressing Retry can never create a second order
   - a clear red bar with a Retry button when the order did not go through
   - the cart is never cleared unless the kitchen really received the order
   Uses globals from app.js at call time (CART, PUBLIC_SLUG, placeOrder, toast). */
(function (root) {
  var KEY = function () { var m = /^\/r\/([^\/?#]+)/.exec(location.pathname); return m ? 'explodish-attempt:' + m[1] : null; };

  function hash(str) { var h = 5381, i; for (i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function randomId() {
    var a = new Uint8Array(12), s = '', i;
    try { (root.crypto || root.msCrypto).getRandomValues(a); } catch (e) { for (i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); }
    for (i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
    return 'o' + s; // 25 characters, letters and digits only
  }

  /* Same cart and table = same id (a retry). Any change to the cart = a new id. */
  root.orderAttemptId = function (order) {
    var key = KEY();
    var sig = hash(JSON.stringify([order.table, (order.items || []).map(function (i) { return [i.dishId, i.price, i.config, i.modifierChoices]; })]));
    try {
      var saved = key && JSON.parse(localStorage.getItem(key) || 'null');
      if (saved && saved.sig === sig && saved.id && Date.now() - saved.t < 12 * 3600 * 1000) return saved.id;
      var fresh = { id: randomId(), sig: sig, t: Date.now() };
      if (key) localStorage.setItem(key, JSON.stringify(fresh));
      return fresh.id;
    } catch (e) { return randomId(); }
  };
  root.clearOrderAttempt = function () { try { var k = KEY(); if (k) localStorage.removeItem(k); } catch (e) {} };

  var TEXT = {
    offline: ["You're offline", 'Your order is saved on this phone. Connect to wifi or mobile data, then tap Retry.'],
    network: ['Order not sent yet', "We couldn't reach the restaurant. Your order is still here. Tap Retry. It will never be sent twice."],
    busy: ['Too many orders from this connection', 'Please wait a minute and tap Retry, or ask a waiter.'],
    rejected: ['Order not sent', '']
  };

  root.showOrderProblem = function (kind, message) {
    var t = TEXT[kind] || TEXT.network;
    var bar = document.getElementById('orderProblem');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'orderProblem';
      bar.setAttribute('role', 'alert');
      document.body.appendChild(bar);
    }
    bar.dataset.kind = kind;
    bar.textContent = '';
    var h = document.createElement('div'); h.className = 'op-title'; h.textContent = t[0];
    var p = document.createElement('div'); p.className = 'op-text'; p.textContent = message || t[1];
    var row = document.createElement('div'); row.className = 'op-row';
    var retry = document.createElement('button'); retry.type = 'button'; retry.className = 'op-retry'; retry.textContent = 'Retry order';
    retry.addEventListener('click', function () {
      if (typeof CART === 'undefined' || !CART.length) { root.clearOrderProblem(); return; }
      retry.disabled = true; retry.textContent = 'Sending\u2026';
      Promise.resolve(placeOrder()).then(function () { if (document.getElementById('orderProblem') === bar && bar.dataset.kind === kind) { retry.disabled = false; retry.textContent = 'Retry order'; } });
    });
    var close = document.createElement('button'); close.type = 'button'; close.className = 'op-close'; close.textContent = 'Close';
    close.addEventListener('click', root.clearOrderProblem);
    row.append(retry, close);
    bar.append(h, p, row);
  };
  root.clearOrderProblem = function () { var b = document.getElementById('orderProblem'); if (b) b.remove(); };

  root.addEventListener('online', function () {
    var b = document.getElementById('orderProblem');
    if (b && typeof CART !== 'undefined' && CART.length) {
      b.dataset.kind = 'network';
      var p = b.querySelector('.op-text'); if (p) p.textContent = "You're back online. Tap Retry to send your order.";
      var h = b.querySelector('.op-title'); if (h) h.textContent = 'Back online';
    }
  });
})(typeof self !== 'undefined' ? self : this);
