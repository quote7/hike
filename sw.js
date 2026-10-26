// Bump V when you change any shell file so installed copies update.
const V = 'OpenTrails-v23';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icon.svg',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/maplibre-gl@5.3.0/dist/maplibre-gl.css',
  'https://cdn.jsdelivr.net/npm/maplibre-gl@5.3.0/dist/maplibre-gl.js',
  'https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js',
  'https://cdn.jsdelivr.net/npm/idb@8.0.0/+esm'];

self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => clients.claim())));

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  e.respondWith(caches.match(r).then(hit => hit || fetch(r)));
});
