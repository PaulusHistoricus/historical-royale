// Service worker voor Legion Royale (installeerbaar + sneller laden).
// - Pagina en version.json: altijd eerst het netwerk, zodat een update meteen zichtbaar is.
// - Scripts (gehasht) en art (?v=<build>): cache-first; hun URL verandert bij elke versie.
const CACHE = 'lr-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const immutable = url.pathname.includes('/assets/') && (url.search.includes('v=') || /-[A-Za-z0-9_-]{8}\.(js|css)$/.test(url.pathname));
  if (immutable) {
    e.respondWith(caches.open(CACHE).then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; })));
  } else {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
  }
});
