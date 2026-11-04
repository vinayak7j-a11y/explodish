/* Explodish: lock-screen notifications card (Kitchen tab) + making /admin installable.
   Everything here is optional: if the browser cannot do it, the card explains why and nothing else changes. */
var PUSH = { state: null, enabled: false, publicKey: '', devices: 0, here: false, busy: false, note: '' };

(function addManifestOnAdmin() {
  if (!/^\/admin/.test(location.pathname)) return;
  var l = document.createElement('link'); l.rel = 'manifest'; l.href = '/manifest.webmanifest'; document.head.appendChild(l);
  var a = document.createElement('link'); a.rel = 'apple-touch-icon'; a.href = '/icons/apple-touch-icon.png'; document.head.appendChild(a);
})();

function pushEnv() {
  var ua = navigator.userAgent || '';
  var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var capable = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  return { ios: ios, standalone: standalone, capable: capable, secure: window.isSecureContext, perm: ('Notification' in window) ? Notification.permission : 'denied' };
}

async function loadPush() {
  PUSH.state = 'loading';
  try {
    var r = await fetch('/api/push/status');
    if (r.ok) { var j = await r.json(); PUSH.enabled = !!j.enabled; PUSH.publicKey = j.publicKey || ''; PUSH.devices = j.devices || 0; }
    var env = pushEnv();
    PUSH.here = false;
    if (env.capable && env.secure) {
      var reg = await navigator.serviceWorker.getRegistration('/');
      var sub = reg ? await reg.pushManager.getSubscription() : null;
      PUSH.here = !!sub && env.perm === 'granted';
    }
  } catch (e) { /* leave defaults */ }
  PUSH.state = 'ready';
  if (typeof activeTab !== 'undefined' && activeTab === 'kitchen') renderAdmin();
}

function pushCardHtml() {
  if (PUSH.state !== 'ready') return '';
  var env = pushEnv(), body = '', btns = '';
  if (!PUSH.enabled) {
    body = 'Not available on this server right now.';
  } else if (env.ios && !env.standalone) {
    body = 'On an iPhone or iPad: tap the Share button, choose <b>Add to Home Screen</b>, open Explodish from your Home Screen, sign in, and come back to this card. (Needs iOS 16.4 or newer.)';
  } else if (!env.capable || !env.secure) {
    body = 'This browser cannot receive lock-screen notifications here. They need a secure address (https) and a recent Chrome, Edge, Firefox or Safari. Telegram alerts below still work.';
  } else if (env.perm === 'denied') {
    body = 'Notifications are blocked for this site. Allow them in your browser or phone settings, then reload this page.';
  } else if (PUSH.here) {
    body = '<b>On for this device.</b> New orders, and reminders if nobody accepts one, will show on the lock screen. ' + PUSH.devices + ' device' + (PUSH.devices === 1 ? '' : 's') + ' set up for this restaurant.';
    btns = '<button type="button" class="btn small" id="pushTest">Send test notification</button> <button type="button" class="btn secondary small" id="pushOff">Turn off on this device</button>';
  } else {
    body = 'Get new orders on this device\'s lock screen, even when this page is closed. Best on the phone or tablet that stays in the kitchen. ' + PUSH.devices + ' device' + (PUSH.devices === 1 ? '' : 's') + ' set up so far.';
    btns = '<button type="button" class="btn small" id="pushOn">Turn on notifications on this device</button>';
  }
  return '<div class="section-card" id="pushCard"><h3>Lock-screen notifications</h3><p class="sc-desc">' + body + '</p>' +
    (PUSH.note ? '<p class="sc-desc" style="color:var(--brass);font-weight:600;">' + escapeHtml(PUSH.note) + '</p>' : '') +
    (btns ? '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + btns + '</div>' : '') + '</div>';
}

function pushKey(b64) {
  var pad = '='.repeat((4 - b64.length % 4) % 4), raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')), out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function pushEnable() {
  if (PUSH.busy) return; PUSH.busy = true; PUSH.note = 'Turning on\u2026 (allow notifications if your browser asks)'; renderAdmin();
  var slow = function (p) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { var e = new Error('timeout'); e.name = 'Timeout'; rej(e); }, 20000); })]); };
  try {
    var reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    var perm = await Notification.requestPermission();
    if (perm !== 'granted') { PUSH.note = 'Notifications were not allowed, so nothing was turned on.'; return; }
    var sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await slow(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushKey(PUSH.publicKey) }));
    var r = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), label: (navigator.userAgent || '').slice(0, 80) }) });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) { PUSH.note = j.error || 'Could not save this device.'; try { await sub.unsubscribe(); } catch (e) {} return; }
    PUSH.here = true; PUSH.devices = j.devices || PUSH.devices + 1;
    toast('Notifications are on for this device');
  } catch (e) {
    console.error(e);
    PUSH.note = (e && e.name === 'Timeout') ? 'This is taking too long. Check your internet connection and try again.' : 'Could not turn on notifications (' + ((e && e.name) || 'error') + '). Check your internet connection and try again.';
  } finally { PUSH.busy = false; renderAdmin(); }
}

async function pushOff() {
  try {
    var reg = await navigator.serviceWorker.getRegistration('/');
    var sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    PUSH.here = false; PUSH.devices = Math.max(0, PUSH.devices - 1); PUSH.note = '';
    toast('Notifications turned off on this device');
  } catch (e) { PUSH.note = 'Could not turn off. Try again.'; }
  renderAdmin();
}

async function pushTest() {
  try {
    var r = await fetch('/api/push/test', { method: 'POST' });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) { PUSH.note = j.error || 'Test failed.'; }
    else if (j.sent) { PUSH.note = 'Sent. It should appear within a few seconds. Lock the phone to see how it looks.'; }
    else { PUSH.note = 'The test could not be delivered. Turn notifications off and on again on this device.'; }
  } catch (e) { PUSH.note = 'Test failed. Check your connection.'; }
  renderAdmin();
}

function wirePush() {
  var on = document.getElementById('pushOn'); if (on) on.addEventListener('click', pushEnable);
  var off = document.getElementById('pushOff'); if (off) off.addEventListener('click', pushOff);
  var t = document.getElementById('pushTest'); if (t) t.addEventListener('click', pushTest);
}
