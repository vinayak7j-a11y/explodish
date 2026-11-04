/* Explodish service worker: shows kitchen notifications on the lock screen. It does nothing else:
   no caching, so it can never serve an old menu or hide a new order. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'Explodish', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'New order', {
    body: d.body || '',
    tag: d.tag || 'explodish',          // the same order replaces its earlier notification instead of piling up
    renotify: true,                      // but still buzzes again (reminders)
    requireInteraction: true,            // stays until someone taps it (where the phone allows)
    vibrate: [300, 120, 300, 120, 300],
    icon: '/icons/icon-192.png',
    data: { url: d.url || '/admin', orderId: d.orderId || null }
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/admin';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf('/admin') !== -1 && 'focus' in list[i]) return list[i].focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
