/* ============================================================
   SERVICE WORKER  — what makes this installable + offline-capable.

   A service worker is a tiny script the browser runs in the
   background, separate from the page. Its job here: decide what to
   do when the app asks for a file (the HTML, an icon, etc).

   STRATEGY: network-first.
   - When you're ONLINE: fetch from the network (so you always get
     your LATEST deploy — crucial while you're still developing;
     a cache-first worker would keep showing stale code after you
     push changes, which feels like "my edits didn't work").
   - When you're OFFLINE: fall back to the cached copy so the app
     still opens.

   Your DATA is never touched here. Entries live in localStorage,
   which the service worker doesn't manage. This only caches the
   app's *files*, never your logged history.
   ============================================================ */

// Bump this version string whenever you want to force-clear old caches.
const CACHE = 'urge-log-v1';

// The files that make up the app shell (what to keep for offline use).
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// On install: pre-cache the shell so the very first offline open works.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();   // activate this new worker right away
});

// On activate: delete any old caches from previous versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// On every request: try network first, fall back to cache when offline.
self.addEventListener('fetch', (event) => {
  // only handle GET requests for our own files
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // got a fresh copy online -> update the cache, then return it
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        // offline (or fetch failed) -> serve the cached copy if we have one
        caches.match(event.request).then((cached) => cached || caches.match('./index.html'))
      )
  );
});
