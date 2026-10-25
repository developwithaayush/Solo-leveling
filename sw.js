// Stale-while-revalidate: instant + offline from cache, refreshed in the background.
const CACHE = 'system-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'logic.js', 'manifest.json', 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request);
    const net = fetch(e.request)
      .then(r => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; })
      .catch(() => hit);
    if (hit) e.waitUntil(net);
    return hit || net;
  }));
});
