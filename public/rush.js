/* Explodish step 1.6: rush controls on the Kitchen tab.
   - Pause ordering: customers can still read the menu but cannot place orders (the server enforces it).
   - Sold out buttons: tap a dish when it runs out, tap again when it is back. */
var PAUSED = undefined; // undefined = not loaded yet
var rushVersion = 0;    // bumped on every change, so a slow older reply can never overwrite a newer state

async function loadRush() {
  var before = PAUSED, v = rushVersion;
  try {
    var r = await fetch('/api/ordering');
    if (r.ok) { var j = await r.json(); if (v === rushVersion) PAUSED = !!j.paused; }
  } catch (e) { /* keep the last known state */ }
  if (PAUSED === undefined) PAUSED = false;
  updatePauseBar();
  // only redraw when something changed, so typing in another card is never interrupted
  if (before !== PAUSED && typeof activeTab !== 'undefined' && activeTab === 'kitchen') renderAdmin();
}

function rushCardHtml() {
  var paused = !!PAUSED;
  var dishes = (typeof DISHES !== 'undefined' ? DISHES : []).map(function (d) {
    return '<button type="button" class="rush-dish' + (d.soldOut ? ' off' : '') + '" data-id="' + escapeHtml(d.id) + '" aria-pressed="' + (d.soldOut ? 'true' : 'false') + '">' +
      escapeHtml(d.name) + '<span>' + (d.soldOut ? 'Sold out' : 'Available') + '</span></button>';
  }).join('');
  return '<div class="section-card" id="rushCard"><h3>Rush controls</h3>' +
    '<div class="rush-pause' + (paused ? ' on' : '') + '">' +
      '<div><b>' + (paused ? 'Ordering is PAUSED' : 'Taking orders') + '</b>' +
      '<div class="sc-desc" style="margin:2px 0 0;">' + (paused ? 'Customers can look at the menu but cannot place orders.' : 'Press Pause when the kitchen is overwhelmed. Customers see a friendly message and keep their cart.') + '</div></div>' +
      '<button type="button" class="btn' + (paused ? '' : ' secondary') + '" id="rushPause">' + (paused ? 'Resume ordering' : 'Pause ordering') + '</button>' +
    '</div>' +
    (dishes ? '<div class="sc-desc" style="margin-top:14px;">Ran out of something? Tap the dish. Tap again when it is back.</div><div class="rush-dishes">' + dishes + '</div>' : '') +
    '</div>';
}

async function setOrderingPaused(paused) {
  rushVersion++;
  try {
    var r = await fetch('/api/ordering', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: paused }) });
    if (!r.ok) throw new Error('x');
    var j = await r.json(); PAUSED = !!j.paused; rushVersion++;
    toast(PAUSED ? 'Ordering is paused. Customers cannot place orders.' : 'Ordering is back on');
  } catch (e) { toast('Could not change that. Check your connection and try again.'); }
  updatePauseBar(); renderAdmin();
}

function wireRush() {
  var p = document.getElementById('rushPause');
  if (p) p.addEventListener('click', function () { p.disabled = true; setOrderingPaused(!PAUSED); });
  document.querySelectorAll('.rush-dish').forEach(function (b) {
    b.addEventListener('click', async function () {
      var id = b.dataset.id, dish = DISHES.find(function (d) { return d.id === id; });
      if (!dish) return;
      b.disabled = true;
      try {
        var upd = await apiSetSoldOut(id, !dish.soldOut);
        dish.soldOut = !!upd.soldOut;
        toast(dish.soldOut ? dish.name + ' is marked sold out' : dish.name + ' is available again');
      } catch (e) { toast('Could not update the dish. Check your connection.'); }
      renderAdmin();
    });
  });
}

/* a slim red bar on every owner tab while ordering is paused, so it is never forgotten */
function updatePauseBar() {
  var bar = document.getElementById('pauseBar');
  if (!PAUSED) { if (bar) bar.remove(); return; }
  if (bar) return;
  bar = document.createElement('div');
  bar.id = 'pauseBar';
  bar.innerHTML = '<span>Ordering is paused</span><button type="button">Resume</button>';
  bar.querySelector('button').addEventListener('click', function () { setOrderingPaused(false); });
  document.body.appendChild(bar);
}

window.addEventListener('focus', function () { if (PAUSED !== undefined && /^\/admin/.test(location.pathname)) loadRush(); });
