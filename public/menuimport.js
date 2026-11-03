/* Explodish menu import (owner side): photo or pasted text -> review list -> publish -> undo.
   Free, no paid AI. Photo reading uses Tesseract.js, which runs inside the owner's browser.
   Depends on globals from app.js (DISHES, EXPLODISH_TEMPLATES, toast, renderAdmin, escapeHtml, fmt, uid, guessAllergens)
   and on MenuParse (menuparse.js). Everything is looked up at call time, so load order is not critical. */

var IMPORT = { text: '', rows: [], ignored: [], busy: false, msg: '', pct: 0, published: [], fromPhoto: false, photos: [] };
var MANUAL_OPEN = false;
var OCR_WORKER = null;
var OCR_CUR = { k: 0, n: 1 };
var IMPORT_MAX_ROWS = 120;

function manualOpen() {
  return MANUAL_OPEN || !!(ownerDraft && (ownerDraft.id || ownerDraft.name || (ownerDraft.ingredients && ownerDraft.ingredients.length)));
}

/* ---------- small helpers ---------- */
function impRowOk(r) {
  return r.include && r.name.trim().length >= 2 && Number(r.price) > 0 && Number(r.price) <= 100000 && !r.nonveg;
}
function impCounts() {
  var ready = IMPORT.rows.filter(impRowOk).length;
  var look = IMPORT.rows.filter(function (r) { return r.include && r.flags.length && !r.nonveg; }).length;
  return { ready: ready, look: look, total: IMPORT.rows.length };
}
function impTemplateOptions(sel) {
  var opts = EXPLODISH_TEMPLATES.map(function (t) {
    return '<option value="' + t.key + '"' + (t.key === sel ? ' selected' : '') + '>' + escapeHtml(t.label) + '</option>';
  });
  opts.push('<option value="plain"' + (sel === 'plain' ? ' selected' : '') + '>Plain item</option>');
  return opts.join('');
}

/* ---------- the card ---------- */
function importCardHtml() {
  var c = impCounts();
  var rows = IMPORT.rows.map(function (r, i) {
    var chips = r.flags.map(function (f) { return '<span class="imp-chip' + (/vegetarian|already/i.test(f) ? ' bad' : '') + '">' + escapeHtml(f) + '</span>'; }).join('');
    var sizes = r.sizes && r.sizes.length
      ? '<div class="imp-sizes">Sizes: ' + r.sizes.map(function (s) { return escapeHtml(s.label) + ' ' + fmt(s.price); }).join(' · ') + ' <button type="button" class="imp-linkbtn imp-nosize">use first price only</button></div>'
      : '';
    return '<div class="imp-row' + (r.include ? '' : ' off') + (r.flags.length ? ' warn' : '') + '" data-i="' + i + '">' +
      '<label class="imp-inc"><input type="checkbox" class="imp-cb"' + (r.include ? ' checked' : '') + (r.nonveg ? ' disabled' : '') + ' aria-label="Include this dish"></label>' +
      '<input class="imp-name" type="text" maxlength="80" value="' + escapeHtml(r.name) + '" aria-label="Dish name">' +
      '<input class="imp-price" type="text" inputmode="numeric" value="' + escapeHtml(String(r.price == null ? '' : r.price)) + '" aria-label="Price in rupees">' +
      '<button type="button" class="imp-del" aria-label="Remove this row">\u2715</button>' +
      '<input class="imp-cat" type="text" maxlength="40" value="' + escapeHtml(r.category) + '" placeholder="Category" aria-label="Category">' +
      '<select class="imp-tpl" aria-label="Dish type">' + impTemplateOptions(r.template) + '</select>' +
      (chips ? '<div class="imp-chips">' + chips + '</div>' : '') + sizes +
      (IMPORT.fromPhoto && r.source ? '<div class="imp-src">Read from photo as: <code>' + escapeHtml(r.source.slice(0, 90)) + '</code></div>' : '') +
      '</div>';
  }).join('');

  var ignored = IMPORT.ignored.length
    ? '<details class="imp-ignored"><summary>Lines we did not use (' + IMPORT.ignored.length + ')</summary>' +
      IMPORT.ignored.map(function (g) { return '<div><code>' + escapeHtml(g.line) + '</code> <span>' + escapeHtml(g.reason) + '</span></div>'; }).join('') + '</details>'
    : '';

  var review = IMPORT.rows.length
    ? '<div class="imp-review">' +
        '<div class="imp-sum" id="impSum">' + impSummaryText(c) + '</div>' +
        (IMPORT.photos.length ? '<div class="imp-photos">Your photo' + (IMPORT.photos.length > 1 ? 's' : '') + ' (tap to enlarge): ' + IMPORT.photos.map(function (u) { return '<a href="' + u + '" target="_blank" rel="noopener"><img src="' + u + '" alt="Menu photo"></a>'; }).join('') + '</div>' : '') +
        '<div class="imp-note">Each dish starts from a template (layers, prices, allergens). Dishes you publish here are marked <b>Check ingredients</b> and are hidden from customers who use the Jain or allergen filters until you mark them checked.</div>' +
        '<div class="imp-rows">' + rows + '</div>' +
        '<div class="imp-actions"><button type="button" class="btn" id="impPublish"' + (c.ready ? '' : ' disabled') + '>' + impPublishLabel(c.ready) + '</button>' +
        '<button type="button" class="btn secondary" id="impClear">Start over</button></div>' +
        ignored + '</div>'
    : (IMPORT.published.length ? '' : ignored);

  var done = IMPORT.published.length
    ? '<div class="imp-done"><b>' + IMPORT.published.length + ' dish' + (IMPORT.published.length === 1 ? '' : 'es') + ' published.</b> Open your menu page to see them. ' +
      'Next, check the ingredients of each one in <b>Your menu</b> below. <button type="button" class="imp-linkbtn" id="impUndo">Undo this import</button></div>'
    : '';

  var busy = IMPORT.busy
    ? '<div class="imp-prog" role="status"><div class="imp-bar"><i id="impBar" style="width:' + IMPORT.pct + '%"></i></div><div id="impMsg">' + escapeHtml(IMPORT.msg) + '</div></div>'
    : (IMPORT.msg ? '<div class="imp-msg" id="impMsg">' + escapeHtml(IMPORT.msg) + '</div>' : '');

  return '<div class="section-card" id="importCard">' +
    '<h3>Add your menu</h3>' +
    '<div class="sc-desc">Take a photo of a menu, or paste it as text. It becomes a list of dishes in a minute. You check the list before anything goes live.</div>' +
    '<div class="imp-buttons">' +
      '<label class="btn file-btn" for="impPhoto">\uD83D\uDCF7 Photo of menu</label>' +
      '<input type="file" id="impPhoto" accept="image/*" multiple class="sr-only-file">' +
      '<button type="button" class="btn secondary" id="impManualToggle">' + (manualOpen() ? 'Hide' : 'Build one dish by hand') + '</button>' +
    '</div>' +
    '<textarea id="impText" rows="7" spellcheck="false" placeholder="Or paste your menu here, one dish per line:\n\nBurgers\nAloo Tikki Burger - 99\nCheese Burger - 129\n\nWraps\nPaneer Wrap 149/199">' + escapeHtml(IMPORT.text) + '</textarea>' +
    '<div class="imp-buttons"><button type="button" class="btn" id="impRead"' + (IMPORT.busy ? ' disabled' : '') + '>Read menu</button></div>' +
    busy + done + review +
    '</div>';
}
function impSummaryText(c) {
  return c.total + ' dish' + (c.total === 1 ? '' : 'es') + ' found \u00b7 ' + c.ready + ' ready to publish' +
    (c.look ? ' \u00b7 ' + c.look + ' to look at' : '') + (IMPORT.ignored.length ? ' \u00b7 ' + IMPORT.ignored.length + ' lines skipped' : '');
}
function impPublishLabel(n) { return n ? 'Publish ' + n + ' dish' + (n === 1 ? '' : 'es') : 'Nothing to publish yet'; }
function impRefreshSummary() {
  var c = impCounts();
  var s = document.getElementById('impSum'); if (s) s.textContent = impSummaryText(c);
  var b = document.getElementById('impPublish'); if (b) { b.textContent = impPublishLabel(c.ready); b.disabled = !c.ready; }
}

/* ---------- reading text into rows ---------- */
function impReadText() {
  var text = IMPORT.text.trim();
  if (!text) { toast('Paste your menu first, or choose a photo'); return; }
  var res = MenuParse.parse(text, { fromPhoto: IMPORT.fromPhoto, existingNames: DISHES.map(function (d) { return d.name; }) });
  IMPORT.rows = res.rows.slice(0, IMPORT_MAX_ROWS).map(function (r) {
    r.include = !r.nonveg && !r.onMenu && r.price > 0;
    return r;
  });
  IMPORT.ignored = res.ignored;
  IMPORT.published = [];
  IMPORT.msg = res.rows.length
    ? ''
    : 'No dishes found. Each dish needs a name and a price on the same line, for example: Aloo Tikki Burger - 99';
  if (res.rows.length > IMPORT_MAX_ROWS) toast('Only the first ' + IMPORT_MAX_ROWS + ' dishes were taken. Import the rest separately.');
  renderAdmin();
}

/* ---------- photo -> text (Tesseract.js, in the browser) ---------- */
function impLoadScript(src) {
  return new Promise(function (resolve, reject) {
    if (document.querySelector('script[data-ocr="' + src + '"]')) return resolve();
    var s = document.createElement('script');
    s.src = src; s.dataset.ocr = src; s.onload = resolve;
    s.onerror = function () { reject(new Error('Photo reading is not installed on this server yet. Run npm install, then restart.')); };
    document.head.appendChild(s);
  });
}
async function impPrepImage(file) {
  var bmp = await createImageBitmap(file);
  var long = Math.max(bmp.width, bmp.height);
  var scale = long > 2600 ? 2600 / long : (long < 1500 ? Math.min(2.5, 1800 / long) : 1);
  var c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
  var x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  var img = x.getImageData(0, 0, c.width, c.height), d = img.data, hist = new Uint32Array(256), n = c.width * c.height, i, g;
  for (i = 0; i < d.length; i += 4) { g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = d[i + 1] = d[i + 2] = g; hist[g]++; }
  var lo = 0, hi = 255, acc = 0;
  for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.01) { lo = i; break; } }
  acc = 0;
  for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.01) { hi = i; break; } }
  if (hi - lo > 20) {
    var span = hi - lo;
    for (i = 0; i < d.length; i += 4) { g = Math.max(0, Math.min(255, (d[i] - lo) * 255 / span)) | 0; d[i] = d[i + 1] = d[i + 2] = g; }
  }
  x.putImageData(img, 0, 0);
  return c;
}
function impProgress(msg, pct) {
  IMPORT.msg = msg; IMPORT.pct = pct;
  var m = document.getElementById('impMsg'); if (m) m.textContent = msg;
  var b = document.getElementById('impBar'); if (b) b.style.width = pct + '%';
}
async function impReadPhotos(files) {
  files = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type); }).slice(0, 6);
  if (!files.length) { toast('Please choose a photo (JPG or PNG)'); return; }
  if (files.some(function (f) { return f.size > 20 * 1024 * 1024; })) { toast('A photo is too large. Please use photos under 20 MB.'); return; }
  IMPORT.photos.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
  IMPORT.photos = files.map(function (f) { return URL.createObjectURL(f); });
  IMPORT.fromPhoto = true;
  IMPORT.busy = true; impProgress('Getting ready (first time only, about 15 MB)...', 2); renderAdmin();
  try {
    await impLoadScript('/vendor/ocr/tesseract.min.js');
    if (!OCR_WORKER) {
      OCR_WORKER = await Tesseract.createWorker('eng', 1, {
        workerPath: '/vendor/ocr/worker.min.js', corePath: '/vendor/ocr/core', langPath: '/vendor/ocr/lang', gzip: true,
        logger: function (m) {
          if (m.status === 'recognizing text') impProgress('Reading photo ' + (OCR_CUR.k + 1) + ' of ' + OCR_CUR.n + '...', Math.round(10 + 85 * ((OCR_CUR.k + m.progress) / OCR_CUR.n)));
          else if (/loading|initializ/.test(m.status || '')) impProgress('Getting ready (first time only)...', 5);
        }
      });
    }
    await OCR_WORKER.setParameters({ preserve_interword_spaces: '1' });
    var texts = [];
    OCR_CUR.n = files.length;
    for (var k = 0; k < files.length; k++) {
      OCR_CUR.k = k;
      impProgress('Reading photo ' + (k + 1) + ' of ' + files.length + '...', Math.round(10 + 85 * (k / files.length)));
      var canvas = await impPrepImage(files[k]);
      var out = await OCR_WORKER.recognize(canvas);
      texts.push((out.data.text || '').trim());
    }
    var got = texts.filter(Boolean).join('\n\n');
    if (!got) throw new Error('No text could be read from the photo. Try a straighter, brighter photo.');
    IMPORT.text = (IMPORT.text.trim() ? IMPORT.text.trim() + '\n\n' : '') + got;
    IMPORT.busy = false; IMPORT.msg = '';
    impReadText();
  } catch (e) {
    console.error(e);
    IMPORT.busy = false; IMPORT.msg = (e && e.message) || 'Could not read the photo.';
    renderAdmin();
  }
}

/* ---------- row -> dish document ---------- */
function impBuildDish(r) {
  var t = EXPLODISH_TEMPLATES.find(function (x) { return x.key === r.template; });
  var sizes = (r.sizes || []).filter(function (s) { return s.price > 0; });
  var base = sizes.length ? sizes[0].price : Number(r.price);
  var dish = {
    name: r.name.trim().slice(0, 80), basePrice: base,
    category: (r.category || (t ? t.category : '') || '').trim().slice(0, 40),
    image: null, removalRefund: false, dietary: 'veg', jainFriendly: !!r.jain, needsReview: true,
    modifiers: sizes.length > 1 ? [{
      id: 'mod-size', name: 'Size',
      options: sizes.map(function (s) { return { label: s.label, priceDelta: s.price - base }; })
    }] : []
  };
  if (t) {
    dish.mode = t.mode;
    dish.ingredients = t.ingredients.map(function (i) {
      var copy = JSON.parse(JSON.stringify(i));
      if (t.mode === 'A') copy.id = uid(); else { copy.swappable = false; copy.swapOptions = []; }
      return copy;
    });
  } else {
    dish.mode = 'B';
    dish.ingredients = [{ name: dish.name, allergens: guessAllergens(dish.name), swappable: false, swapOptions: [] }];
  }
  return dish;
}

async function impPublish() {
  var list = IMPORT.rows.filter(impRowOk);
  if (!list.length) return;
  if (list.length > 30 && !confirm('Publish ' + list.length + ' dishes to the live menu?')) return;
  IMPORT.busy = true; impProgress('Publishing...', 0); renderAdmin();
  var made = [], failed = [], i, r;
  for (i = 0; i < list.length; i++) {
    r = list[i];
    impProgress('Publishing ' + (i + 1) + ' of ' + list.length + '...', Math.round(100 * i / list.length));
    try {
      var res = await fetch('/api/dishes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(impBuildDish(r)) });
      var j = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(j.error || 'Server said no');
      DISHES.push(j); made.push(j.id);
      IMPORT.rows = IMPORT.rows.filter(function (x) { return x !== r; });
    } catch (e) {
      failed.push(r.name + ': ' + e.message);
      r.flags = r.flags.filter(function (f) { return f.indexOf('Could not publish') !== 0; });
      r.flags.push('Could not publish: ' + e.message);
      if (/log in|401|Not logged/i.test(e.message)) break;
    }
  }
  IMPORT.busy = false;
  IMPORT.published = IMPORT.published.concat(made);
  IMPORT.msg = failed.length ? failed.length + ' dish' + (failed.length === 1 ? '' : 'es') + ' could not be published. See the flags below.' : '';
  if (!IMPORT.rows.length) { IMPORT.text = ''; IMPORT.ignored = []; }
  renderAdmin();
  if (made.length) toast(made.length + ' dishes are live on your menu');
}

async function impUndo() {
  var ids = IMPORT.published.slice();
  if (!ids.length || !confirm('Delete the ' + ids.length + ' dishes you just published?')) return;
  var gone = 0;
  for (var i = 0; i < ids.length; i++) {
    try { var r = await fetch('/api/dishes/' + ids[i], { method: 'DELETE' }); if (r.ok) { gone++; DISHES = DISHES.filter(function (d) { return d.id !== ids[i]; }); } } catch (e) {}
  }
  IMPORT.published = IMPORT.published.filter(function (id) { return DISHES.some(function (d) { return d.id === id; }); });
  toast(gone + ' dishes removed');
  renderAdmin();
}

/* ---------- wiring (runs every time the owner screen is drawn) ---------- */
function wireImport() {
  var card = document.getElementById('importCard');
  if (!card) return;
  var q = function (s) { return card.querySelector(s); };
  q('#impText').addEventListener('input', function (e) { IMPORT.text = e.target.value; });
  q('#impRead').addEventListener('click', impReadText);
  q('#impPhoto').addEventListener('change', function (e) { var f = Array.prototype.slice.call(e.target.files || []); e.target.value = ''; impReadPhotos(f); });
  q('#impManualToggle').addEventListener('click', function () { MANUAL_OPEN = !manualOpen(); if (!MANUAL_OPEN && ownerDraft && !ownerDraft.id) { /* keep draft text, just hide */ } renderAdmin(); if (MANUAL_OPEN) { var f = document.getElementById('dishName'); if (f) f.focus(); } });
  var pub = q('#impPublish'); if (pub) pub.addEventListener('click', impPublish);
  var clr = q('#impClear'); if (clr) clr.addEventListener('click', function () { IMPORT.rows = []; IMPORT.ignored = []; IMPORT.msg = ''; IMPORT.fromPhoto = false; IMPORT.photos = []; renderAdmin(); });
  var und = q('#impUndo'); if (und) und.addEventListener('click', impUndo);

  var rowsEl = q('.imp-rows');
  if (rowsEl) {
    var rowOf = function (el) { var row = el.closest('.imp-row'); return row ? IMPORT.rows[Number(row.dataset.i)] : null; };
    rowsEl.addEventListener('input', function (e) {
      var r = rowOf(e.target); if (!r) return;
      if (e.target.classList.contains('imp-name')) { r.name = e.target.value; }
      else if (e.target.classList.contains('imp-price')) { r.price = e.target.value.replace(/[^\d]/g, ''); if (r.price !== e.target.value) e.target.value = r.price; r.price = r.price ? Number(r.price) : 0; if (r.sizes && r.sizes.length) { r.sizes = []; } }
      else if (e.target.classList.contains('imp-cat')) { r.category = e.target.value; }
      impRefreshSummary();
    });
    rowsEl.addEventListener('change', function (e) {
      var r = rowOf(e.target); if (!r) return;
      if (e.target.classList.contains('imp-cb')) { r.include = e.target.checked; e.target.closest('.imp-row').classList.toggle('off', !r.include); impRefreshSummary(); }
      else if (e.target.classList.contains('imp-tpl')) { r.template = e.target.value; }
    });
    rowsEl.addEventListener('click', function (e) {
      var r = rowOf(e.target); if (!r) return;
      if (e.target.closest('.imp-del')) { IMPORT.rows.splice(Number(e.target.closest('.imp-row').dataset.i), 1); renderAdmin(); }
      else if (e.target.closest('.imp-nosize')) { r.price = r.sizes[0].price; r.sizes = []; r.flags = r.flags.filter(function (f) { return !/Sizes guessed/.test(f); }); renderAdmin(); }
    });
  }

  document.querySelectorAll('.mark-checked').forEach(function (btn) {
    btn.addEventListener('click', async function (e) {
      var id = e.target.closest('.dish-manage-row').dataset.id;
      var d = DISHES.find(function (x) { return x.id === id; });
      if (!d) return;
      try {
        var res = await fetch('/api/dishes/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, d, { needsReview: false })) });
        if (!res.ok) throw new Error('x');
        var upd = await res.json();
        DISHES[DISHES.findIndex(function (x) { return x.id === id; })] = upd;
        toast('Marked as checked');
        renderAdmin();
      } catch (err) { toast('Could not save. Check your connection.'); }
    });
  });
}
