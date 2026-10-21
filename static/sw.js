'use strict';
const CACHE = 'the-mile-shell-v121-test-calendar';
const SHELL = ['/', '/style.css?v=145', '/app.js?v=150', '/logo.png', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/pdf-open.html', '/pdf-open.css', '/pdf-open.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const networkFirst = request.mode === 'navigate' || ['/app.js','/style.css','/sw.js','/manifest.webmanifest','/admin-microcycles.js','/admin-microcycles.css'].includes(url.pathname);
  if (networkFirst) {
    event.respondWith(
      fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
        return response;
      }).catch(() => caches.match(request).then(r => r || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
      return response;
    }))
  );
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}
  const title = String(payload.title || 'The Mile');
  const options = {body: String(payload.body || ''), icon: '/icon-192.png', badge: '/icon-192.png', tag: String(payload.id || 'mile-notification'), data: {url: '/'}};
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destination = new URL('/?view=notifications', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        try {
          const target = await client.navigate(destination);
          if (target) return target.focus();
        } catch (_) {
          try { return client.focus(); } catch (_) {}
        }
      }
    }
    return self.clients.openWindow(destination);
  })());
});
