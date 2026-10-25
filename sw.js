// Bump V when you change any shell file so installed copies update.
const V = 'switchback-v3', TILES = 'switchback-tiles', MAX_TILES = 1500;
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icon.svg',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/idb@8.0.0/+esm'];

self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== TILES).map(k => caches.delete(k)))).then(() => clients.claim())));

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (/(^|\.)tile\.(openstreetmap|opentopomap)\.org$/.test(u.hostname)) return e.respondWith(tile(r));
  e.respondWith(caches.match(r).then(hit => hit || fetch(r)));
});

// Cache-first for tiles the user has actually viewed. Nothing is prefetched.
async function tile(r) {
  const c = await caches.open(TILES), hit = await c.match(r);
  if (hit) return hit;
  try {
    const res = await fetch(r);
    if (res.ok) { c.put(r, res.clone()); if (Math.random() < .05) trim(c); }
    return res;
  } catch { return new Response('', {status: 504}); }
}
async function trim(c) {
  const k = await c.keys();
  if (k.length > MAX_TILES) await Promise.all(k.slice(0, k.length - MAX_TILES).map(x => c.delete(x)));
}
