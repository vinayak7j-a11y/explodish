/* Explodish pro layer: polish on top of the existing app. Adding ?classic to any address switches it off. */
(function () {
  'use strict';
  if (/[?&]classic(\b|=)/.test(location.search)) return;
  document.documentElement.classList.add('pro');

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var raf = null, observer = null;

  /* 1. Mark up containers whose class names we don't know in advance */
  function tag() {
    var tab = $('.tab'); if (tab && tab.parentElement) tab.parentElement.classList.add('pro-tabbar');
    var save = $('#saveDishBtn'); if (save && save.parentElement) save.parentElement.classList.add('pro-actionbar');
    var tk = $('.ticket-card');
    if (tk && tk.parentElement && !tk.parentElement.classList.contains('pro-ticket-grid')) {
      var holder = tk.parentElement, wrap = document.createElement('div');
      wrap.className = 'pro-ticket-grid';
      holder.insertBefore(wrap, tk);
      $$('.ticket-card', holder).forEach(function (t) { if (t.parentElement === holder) wrap.appendChild(t); });
    }
    $$('.section-card h3').forEach(function (h) {
      if (h.dataset.proStep) return;
      var n = h.firstChild; if (!n || n.nodeType !== 3) return;
      var m = /^\s*(\d)\s*\u00b7\s*(.*)$/.exec(n.nodeValue); if (!m) return;
      h.dataset.proStep = '1';
      var b = document.createElement('span'); b.className = 'pro-step'; b.textContent = m[1];
      n.nodeValue = m[2];
      h.insertBefore(b, n);
    });
    $$('.menu-grid .dish-card').forEach(function (c, i) { c.style.setProperty('--n', Math.min(i, 10)); });
  }

  /* 2. Live preview of the dish being built (Owner tools, wide screens) */
  function ownerOk() { return $('#dishName') && typeof ownerDraft !== 'undefined' && ownerDraft; }
  function mountPreview() {
    var grid = $('.pro-owner-grid');
    if (!ownerOk()) {
      if (grid) { grid.classList.remove('pro-owner-grid'); var old = $('.pro-preview'); if (old) old.remove(); }
      return;
    }
    if (!grid) {
      var first = $('.section-card'); if (!first || !first.parentElement) return;
      grid = first.parentElement; grid.classList.add('pro-owner-grid');
    }
    var p = $('.pro-preview');
    if (!p) {
      p = document.createElement('aside'); p.className = 'pro-preview';
      p.innerHTML = '<div class="pp-label">Live preview</div><div class="pp-stage"></div><div class="pp-name"></div><div class="pp-sub"></div><div class="pp-tip">Drag the \u283f handle on a layer to reorder it. The top of the list is the top of the stack.</div>';
      grid.appendChild(p);
    } else if (p.parentElement !== grid) { grid.appendChild(p); }
    updatePreview();
  }
  function updatePreview() {
    var p = $('.pro-preview'); if (!p || !ownerOk()) return;
    var d = ownerDraft, stage = $('.pp-stage', p);
    var ings = (d.ingredients || []).filter(function (i) { return i && i.name && String(i.name).trim(); });
    stage.textContent = '';
    if (d.image) {
      var img = new Image(); img.className = 'pp-img'; img.alt = ''; img.src = d.image; stage.appendChild(img);
    } else if (d.mode === 'A' && ings.length) {
      var cfg = ings.map(function (i) { return { id: i.id, qty: i.included === false ? 0 : 1 }; });
      var box = document.createElement('div'); box.className = 'pp-stack';
      box.innerHTML = renderExplodedStack({ mode: 'A', ingredients: ings }, cfg, { compact: false });
      stage.appendChild(box);
    } else if (d.mode === 'B') {
      var bx = document.createElement('div'); bx.className = 'pp-stack'; bx.innerHTML = renderModeBIcon(d); stage.appendChild(bx);
    } else {
      var hint = document.createElement('div'); hint.className = 'pp-hint'; hint.textContent = 'Add layers and watch your dish take shape here.'; stage.appendChild(hint);
    }
    var price = Number(d.basePrice) || 0;
    $('.pp-name', p).textContent = d.name || 'Your dish';
    $('.pp-sub', p).textContent = (typeof fmt === 'function' ? fmt(price) : '\u20b9' + price) + ' \u00b7 ' + (d.category || 'No category yet') + ' \u00b7 ' + (d.mode === 'A' ? 'Exploded layers' : 'Ingredient view');
  }

  /* 3. Drag to reorder layers (SortableJS) */
  function sortables() {
    var list = $('#ingredientList');
    if (!list || typeof Sortable === 'undefined' || !ownerOk() || ownerDraft.mode !== 'A') return;
    var rows = $$('.ingredient-row', list);
    if (rows.length < 2) return;
    rows.forEach(function (r) {
      if ($('.pro-handle', r)) return;
      var h = document.createElement('span'); h.className = 'pro-handle'; h.title = 'Drag to reorder'; h.setAttribute('aria-hidden', 'true'); h.textContent = '\u283f';
      r.appendChild(h);
    });
    if (list._sortable) return;
    list._sortable = Sortable.create(list, {
      animation: 180, handle: '.pro-handle', draggable: '.ingredient-row', forceFallback: true,
      ghostClass: 'pro-ghost', chosenClass: 'pro-chosen', fallbackClass: 'pro-fallback',
      onEnd: function (e) {
        var a = e.oldDraggableIndex, b = e.newDraggableIndex;
        if (a == null || b == null || a === b) return;
        var arr = ownerDraft.ingredients, m = arr.splice(a, 1)[0]; arr.splice(b, 0, m);
        if (typeof renderAdmin === 'function') renderAdmin();
      }
    });
  }

  /* 4. Confetti when a customer reaches the top build level */
  function celebrate() {
    var b = $('.bl-badge.pop');
    if (!b || b._proDone) return;
    b._proDone = true;
    if (reduced || typeof confetti !== 'function') return;
    var r = b.getBoundingClientRect();
    confetti({ particleCount: 90, spread: 75, startVelocity: 38, ticks: 160, zIndex: 10050,
      origin: { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight },
      colors: ['#E0A542', '#C88A2E', '#5C7A50', '#F4EAD1', '#B3452A'] });
  }

  /* 5. Kitchen: chime and flash when a new order arrives, with a mute switch */
  var seen = null, audio = null, soundOn = true;
  try { soundOn = localStorage.getItem('explodish-kitchen-sound') !== 'off'; } catch (e) {}
  function unlockAudio() {
    if (audio) return;
    try { var C = window.AudioContext || window.webkitAudioContext; if (C) audio = new C(); } catch (e) {}
  }
  ['pointerdown', 'keydown'].forEach(function (t) { document.addEventListener(t, unlockAudio, { passive: true }); });
  function chime() {
    if (!audio || !soundOn) return;
    try {
      if (audio.state === 'suspended') audio.resume();
      [[880, 0], [1175, 0.16]].forEach(function (n) {
        var t0 = audio.currentTime + n[1], o = audio.createOscillator(), g = audio.createGain();
        o.type = 'sine'; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
        o.connect(g); g.connect(audio.destination); o.start(t0); o.stop(t0 + 0.35);
      });
    } catch (e) {}
  }
  function soundLabel() { return soundOn ? '\ud83d\udd14 New-order sound: on' : '\ud83d\udd15 New-order sound: off'; }
  function soundButton() {
    var btn = $('.pro-sound');
    if (btn) return btn;
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pro-sound'; btn.hidden = true; btn.textContent = soundLabel();
    btn.addEventListener('click', function () {
      unlockAudio(); soundOn = !soundOn;
      try { localStorage.setItem('explodish-kitchen-sound', soundOn ? 'on' : 'off'); } catch (e) {}
      btn.textContent = soundLabel(); if (soundOn) chime();
    });
    document.body.appendChild(btn);
    return btn;
  }
  function kitchen() {
    var active = $('.tab.active'), onKitchen = !!(active && active.dataset.tab === 'kitchen');
    soundButton().hidden = !onKitchen;
    if (!onKitchen) { seen = null; return; }
    var ids = {}, fresh = [];
    $$('.ticket-card').forEach(function (t) {
      var m = /Order\s+([a-z0-9]+)/i.exec((t.querySelector('.ticket-head') || t).textContent); if (!m) return;
      ids[m[1]] = 1;
      if (seen && !seen[m[1]] && t.querySelector('.status-new')) fresh.push(t);
    });
    if (seen && fresh.length) { chime(); fresh.forEach(function (t) { t.classList.add('pro-flash'); }); }
    seen = ids; // an empty kitchen counts as "seen nothing", so the very first order still chimes
  }

  /* 6. Burgers tilt toward the mouse on the customer menu */
  var tilted = null;
  document.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || reduced) return;
    var c = e.target.closest && e.target.closest('.dish-card');
    if (tilted && tilted !== c) { tilted.style.removeProperty('--rx'); tilted.style.removeProperty('--ry'); tilted = null; }
    if (!c) return;
    tilted = c;
    var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    c.style.setProperty('--ry', (x * 14).toFixed(1) + 'deg'); c.style.setProperty('--rx', (-y * 10).toFixed(1) + 'deg');
  }, { passive: true });

  /* 7. Keep everything in step with the app, which redraws whole screens */
  function refresh() {
    raf = null;
    if (observer) observer.disconnect();
    try { tag(); mountPreview(); sortables(); celebrate(); kitchen(); }
    catch (e) { if (window.console) console.warn('pro layer:', e); }
    if (observer) observer.observe(document.body, { childList: true, subtree: true });
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(refresh); }
  ['input', 'change', 'click', 'keyup'].forEach(function (t) {
    document.addEventListener(t, function (e) {
      if (e.target.closest && e.target.closest('.pro-preview')) return;
      if ($('.pro-preview')) requestAnimationFrame(updatePreview);
    }, true);
  });
  observer = new MutationObserver(schedule);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule); else schedule();
  window.addEventListener('load', schedule);
  window.__pro = { refresh: refresh };
})();
