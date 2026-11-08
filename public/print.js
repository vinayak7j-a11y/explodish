/* Explodish step 1.7: print a kitchen ticket (80 mm receipt paper, also fine on A4).
   Uses a hidden frame so no pop-up window is needed. Works with any printer the computer or tablet can print to. */
function ticketModClass(m) {
  var t = String(m).trim();
  return /^(no |without |skip |\u2212|-)/i.test(t) ? 'rm' : (/^\+/.test(t) ? 'ad' : '');
}

function buildTicketHtml(o, restaurantName) {
  var when = new Date(o.time);
  var hhmm = when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  var day = when.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  var items = (o.items || []).map(function (it) {
    var mods = (it.mods || []).map(function (m) {
      var cls = ticketModClass(m);
      var t = String(m).trim().replace(/^[\u2212-]\s*/, '- ').replace(/^\+\s*/, '+ ');
      return '<div class="mod ' + cls + '">' + escapeHtml(cls ? t.toUpperCase() : t) + '</div>';
    }).join('');
    return '<div class="item">' + escapeHtml(it.dishName) + '</div>' + mods;
  }).join('');
  var label = o.test ? 'TEST ORDER' : (o.number ? 'ORDER #' + o.number : 'ORDER ' + o.id);
  return '<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title><style>' +
    '@page{size:80mm auto;margin:3mm}html,body{margin:0;padding:0}' +
    'body{width:72mm;font:13px/1.35 "Courier New",ui-monospace,monospace;color:#000;background:#fff}' +
    '.c{text-align:center}.name{font-weight:700;font-size:14px}.big{font-size:30px;font-weight:900;letter-spacing:1px;margin:2px 0}' +
    '.hr{border-top:1px dashed #000;margin:6px 0}.item{font-weight:900;font-size:15px;margin-top:6px;text-transform:uppercase}' +
    '.mod{padding-left:10px;font-weight:700}.mod.rm,.mod.ad{font-weight:900}.test{border:2px solid #000;padding:2px;margin:4px 0;font-weight:900;text-align:center}' +
    '.tot{text-align:right;font-weight:900;font-size:15px}.foot{text-align:center;font-size:11px;margin-top:8px}' +
    '</style></head><body>' +
    '<div class="c name">' + escapeHtml(restaurantName || 'Kitchen') + '</div>' +
    (o.test ? '<div class="test">*** TEST ORDER ***</div>' : '') +
    '<div class="c big">' + (o.table ? 'TABLE ' + escapeHtml(String(o.table)) : 'NO TABLE') + '</div>' +
    '<div class="c">' + label + ' \u00b7 ' + hhmm + ' \u00b7 ' + day + '</div>' +
    '<div class="hr"></div>' + items + '<div class="hr"></div>' +
    (o.test ? '' : '<div class="tot">TOTAL Rs ' + escapeHtml(String(o.total)) + '</div>') +
    '<div class="foot">Printed ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + '</div>' +
    '</body></html>';
}

function printTicket(id) {
  var o = (typeof ORDERS !== 'undefined' ? ORDERS : []).find(function (x) { return x.id === id; });
  if (!o) { toast('That order is no longer on this screen'); return; }
  var name = (typeof CURRENT_RESTAURANT !== 'undefined' && CURRENT_RESTAURANT) ? CURRENT_RESTAURANT.name : 'Kitchen';
  var f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  f.srcdoc = buildTicketHtml(o, name);
  f.onload = function () {
    setTimeout(function () {
      try { f.contentWindow.focus(); f.contentWindow.print(); }
      catch (e) { toast('Could not open the print window'); }
      setTimeout(function () { if (f.isConnected) f.remove(); }, 60000);
    }, 200);
  };
  document.body.appendChild(f);
}

function wirePrint() {
  document.querySelectorAll('.print-ticket').forEach(function (b) {
    b.addEventListener('click', function () { printTicket(b.dataset.id); });
  });
}
