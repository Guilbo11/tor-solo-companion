/* Minimal offline cache for PWA install.
 * Note: Vite handles hashing of built assets; this SW caches core routes for offline launch.
 */

const CACHE = 'torc-cache-v1';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/vite.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((res) => {
        // Only cache same-origin responses
        try {
          const url = new URL(req.url);
          if (url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
        } catch {}
        return res;
      }).catch(() => cached)
    )
  );
});
