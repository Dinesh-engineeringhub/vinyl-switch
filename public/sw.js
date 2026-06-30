// Minimal service worker: caches the app shell so it works offline, but uses a
// NETWORK-FIRST strategy so users always get the latest version when online.
// (Cache-first caused the app to keep serving a stale page after a deploy.)
const CACHE = 'vinyl-switch-v6';
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
  if (e.request.method !== 'GET') return;       // only cache GETs
  if (url.pathname.startsWith('/api/')) return; // never cache API calls
  if (url.origin !== location.origin) return;   // let CDN/cross-origin hit the network

  // Network-first: fetch fresh, update the cache, fall back to cache offline.
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
