// Minimal service worker: caches the app shell so it loads instantly and
// works offline. API calls always go to the network (never cached).
const CACHE = 'vinyl-switch-v4';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/icons/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return; // don't cache API
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
