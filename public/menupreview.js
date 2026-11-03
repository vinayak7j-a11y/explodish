/* Explodish: live menu preview inside Owner tools, and the "Preview" mode of the customer page.
   The preview is the real customer page in a phone-sized frame with ordering switched off (?preview=1),
   so the owner never has to open the customer page to see how the menu looks. */
var PREVIEW_HIDDEN = false;

function previewCardHtml() {
  var slug = (typeof CURRENT_RESTAURANT !== 'undefined' && CURRENT_RESTAURANT) ? CURRENT_RESTAURANT.slug : null;
  if (!slug) return '';
  var url = '/r/' + encodeURIComponent(slug);
  var has = DISHES.length > 0;
  var body = !has
    ? '<div class="pv-empty">No dishes yet. Add your menu above and it appears here.</div>'
    : (PREVIEW_HIDDEN ? '' : '<div class="pv-phone"><iframe id="pvFrame" title="Menu preview" src="' + url + '?preview=1&v=' + DISHES.length + '"></iframe></div>');
  return '<div class="section-card" id="previewCard">' +
    '<h3>Your menu, as customers see it</h3>' +
    '<div class="sc-desc">A live preview. Open dishes and try the + and \u2212 buttons. Ordering is switched off here, so nothing reaches your kitchen.</div>' +
    (has ? '<div class="imp-buttons">' +
      '<button type="button" class="btn secondary" id="pvRefresh">Refresh preview</button>' +
      '<button type="button" class="btn secondary" id="pvToggle">' + (PREVIEW_HIDDEN ? 'Show preview' : 'Hide preview') + '</button>' +
      '<a class="btn secondary" style="text-decoration:none;display:inline-block;" href="' + url + '" target="_blank" rel="noopener">Open customer page</a>' +
    '</div>' : '') +
    body + '</div>';
}

function wirePreview() {
  var r = document.getElementById('pvRefresh');
  if (r) r.addEventListener('click', function () {
    var f = document.getElementById('pvFrame');
    if (f) f.contentWindow.location.reload(); else { PREVIEW_HIDDEN = false; renderAdmin(); }
  });
  var t = document.getElementById('pvToggle');
  if (t) t.addEventListener('click', function () { PREVIEW_HIDDEN = !PREVIEW_HIDDEN; renderAdmin(); });
}

/* shown inside the frame (customer page opened with ?preview=1) */
function showPreviewBanner() {
  if (document.getElementById('previewBanner')) return;
  var b = document.createElement('div');
  b.id = 'previewBanner';
  b.textContent = 'Preview \u00b7 ordering is off';
  b.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:99999;padding:6px 14px;border-radius:99px;background:rgba(0,0,0,.72);color:#ffd27a;font:700 12px/1 system-ui,sans-serif;letter-spacing:.3px;white-space:nowrap;pointer-events:none;';
  document.body.appendChild(b);
}
