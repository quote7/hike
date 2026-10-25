import {openDB} from 'https://cdn.jsdelivr.net/npm/idb@8.0.0/+esm';
import {MAPBOX_TOKEN} from './config.js';

const $ = s => document.querySelector(s), p2 = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
const RM = matchMedia('(prefers-reduced-motion:reduce)').matches;
const TRACK = '#ff2d55';
const db = await openDB('switchback', 1, {upgrade(d) { d.createObjectStore('hikes', {keyPath: 'id'}); d.createObjectStore('draft'); }});
let imp = localStorage.units === 'imp';

/* ---------- formatting ---------- */
const fD = m => imp ? (m / 1609.344).toFixed(2) + ' mi' : (m / 1000).toFixed(2) + ' km';
const fE = m => imp ? Math.round(m * 3.281) + ' ft' : Math.round(m) + ' m';
const fT = s => { s = Math.round(s); const h = s / 3600 | 0, m = s % 3600 / 60 | 0; return h ? `${h}:${p2(m)}:${p2(s % 60)}` : `${m}:${p2(s % 60)}`; };
const fP = v => v > .3 ? fT((imp ? 1609.344 : 1000) / v) + (imp ? ' /mi' : ' /km') : '\u2013';
const fS = v => (v * (imp ? 2.237 : 3.6)).toFixed(1) + (imp ? ' mph' : ' km/h');
let tt; const toast = m => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 3500); };
function ask(h, p, ok, no = 'Cancel') {
  const d = $('#dlg'); d.querySelector('h2').textContent = h; d.querySelector('p').textContent = p;
  d.querySelector('[value=ok]').textContent = ok; d.querySelector('[value=no]').textContent = no;
  d.returnValue = 'no'; d.showModal();
  return new Promise(r => d.onclose = () => r(d.returnValue === 'ok'));
}

/* ---------- map ---------- */
const map = L.map('map', {zoomControl: false, attributionControl: false, zoomAnimation: !RM, fadeAnimation: !RM, markerZoomAnimation: !RM}).setView([20, 0], 2);
L.control.attribution({position: 'topright', prefix: '<a href="https://leafletjs.com">Leaflet</a>'}).addTo(map);
const base = {
  osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, crossOrigin: true, attribution: '\u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}),
  topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {maxZoom: 17, crossOrigin: true, attribution: '\u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM \u00b7 \u00a9 <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'})
};
if (MAPBOX_TOKEN) base.outdoors = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`,
  {tileSize: 512, zoomOffset: -1, maxZoom: 20, attribution: '\u00a9 <a href="https://www.mapbox.com/about/maps/">Mapbox</a> \u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors <a href="https://www.mapbox.com/map-feedback/"><b>Improve this map</b></a>'});
const NAMES = {osm: 'OpenStreetMap', topo: 'OpenTopoMap with contour lines', outdoors: 'Mapbox Outdoors'};
let cur = base[localStorage.layer] ? localStorage.layer : base.outdoors ? 'outdoors' : 'osm'; base[cur].addTo(map);
$('#layers').onclick = () => { const k = Object.keys(base); map.removeLayer(base[cur]); cur = k[(k.indexOf(cur) + 1) % k.length]; base[cur].addTo(map); localStorage.layer = cur; toast(NAMES[cur]); };

let me, ring;
function dot(c) {
  const ll = [c.latitude, c.longitude];
  if (!me) {
    ring = L.circle(ll, {radius: c.accuracy, weight: 1, color: '#1a73e8', fillOpacity: .12}).addTo(map);
    me = L.circleMarker(ll, {radius: 9, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1}).addTo(map);
  } else { me.setLatLng(ll); ring.setLatLng(ll).setRadius(c.accuracy); }
}

/* ---------- GPS ---------- */
let wid = null, first = true, follow = true, last = null, rec = null, line = null, wl = null, layer = null;
const setFollow = f => { follow = f; $('#loc').classList.toggle('on', f); $('#loc').setAttribute('aria-pressed', f); };
map.on('dragstart', () => setFollow(false));   // dragging the map stops following; the locate button resumes
const chip = (t, c = '') => { const e = $('#gps'); e.textContent = t; e.className = 'chip ' + c; };
const quality = a => chip(`GPS ${a <= 15 ? 'good' : a <= 30 ? 'fair' : 'weak'}, \u00b1${fE(a)}`, a <= 15 ? 'ok' : a <= 30 ? 'warn' : 'bad');

function onErr(e) {
  if (e.code === 1) {
    chip('Location blocked', 'bad');
    toast('Location is blocked. Allow it in your browser site settings, then reload.');
    if (wid != null) { navigator.geolocation.clearWatch(wid); wid = null; }
  } else chip(e.code === 2 ? 'No GPS signal' : 'Searching for GPS\u2026', 'warn');
}
async function ensureGeo() {
  if (wid != null) return true;
  if (!navigator.geolocation) { chip('GPS unavailable', 'bad'); toast('This device has no geolocation support.'); return false; }
  let st; try { st = await navigator.permissions.query({name: 'geolocation'}); } catch {}
  if (st?.state === 'denied') { onErr({code: 1}); return false; }
  if (st?.state !== 'granted' && !await ask('Use your location?', 'Switchback needs GPS to show you on the map and record your path. Your location stays on this device.', 'Allow location', 'Not now')) return false;
  chip('Searching for GPS\u2026', 'warn');
  wid = navigator.geolocation.watchPosition(onFix, onErr, {enableHighAccuracy: true, maximumAge: 0, timeout: 20000});
  return true;
}
function onFix(p) {
  const c = p.coords; last = p; quality(c.accuracy); dot(c);
  if (follow) { const ll = [c.latitude, c.longitude]; first ? map.setView(ll, 16, {animate: false}) : map.panTo(ll, {animate: !RM, duration: .8}); }
  first = false;
  if (rec?.state === 'rec') add({lat: c.latitude, lon: c.longitude, ele: c.altitude, t: p.timestamp, acc: c.accuracy});
}
$('#loc').onclick = async () => { if (!await ensureGeo()) return; setFollow(true); if (last) map.setView([last.coords.latitude, last.coords.longitude], Math.max(map.getZoom(), 16), {animate: !RM}); };

/* ---------- recording ---------- */
const F = [['Distance', r => fD(r.dist)], ['Time', r => fT(r.elapsed / 1e3)], ['Moving time', r => fT(r.moving)], ['Pace', r => fP(r.v)],
  ['Average pace', r => fP(r.moving ? r.dist / r.moving : 0)], ['Speed', r => fS(r.v)], ['Average speed', r => fS(r.moving ? r.dist / r.moving : 0)], ['Gain / loss', r => `+${fE(r.gain)} / \u2212${fE(r.loss)}`]];
$('#stats').innerHTML = F.map(([k], i) => `<div><small>${k}</small><b id="s${i}">\u2013</b></div>`).join('');
const draw = () => { if (!rec) return; F.forEach(([, f], i) => $('#s' + i).textContent = f(rec)); $('#mini').innerHTML = `<span>${fD(rec.dist)}</span><span>${fT(rec.elapsed / 1e3)}</span>`; };
const save = () => rec && db.put('draft', {...rec}, 'cur');
const view = v => { document.querySelectorAll('.view').forEach(e => e.hidden = e.id !== 'v-' + v); if (v !== 'rec') setCollapsed(false); };
const pauseUI = p => { $('#pt').textContent = p ? 'Resume' : 'Pause'; $('#pi').setAttribute('href', p ? '#i-play' : '#i-pause'); };

/* collapsible panel: tap or swipe the handle (keyboard: Enter/Space) */
const sheet = $('#sheet'), grab = $('#grab');
const setCollapsed = c => { sheet.classList.toggle('collapsed', c); grab.setAttribute('aria-expanded', !c); grab.setAttribute('aria-label', c ? 'Expand panel' : 'Collapse panel'); localStorage.collapsed = c ? '1' : '0'; };
let gy = null;
grab.onpointerdown = e => { gy = e.clientY; grab.setPointerCapture(e.pointerId); };
grab.onpointerup = e => { if (gy == null) return; const dy = e.clientY - gy; gy = null; setCollapsed(Math.abs(dy) > 20 ? dy > 0 : !sheet.classList.contains('collapsed')); };
grab.onpointercancel = () => gy = null;
grab.onclick = e => { if (!e.detail) setCollapsed(!sheet.classList.contains('collapsed')); };
setCollapsed(localStorage.collapsed === '1');

function add(q) {
  if (q.acc > 30) return;                                   // drop poor fixes
  const a = rec.pts.at(-1); let d = 0, dt = 0;
  if (a) { d = map.distance([a.lat, a.lon], [q.lat, q.lon]); if (d < 5) return; dt = (q.t - a.t) / 1e3; }   // drop jitter
  if (q.ele != null) {                                       // smooth, then count gain/loss with a 3 m dead band
    q.ele = rec.sm == null ? q.ele : rec.sm * .7 + q.ele * .3; rec.sm = q.ele;
    if (rec.ref == null) rec.ref = q.ele;
    else if (Math.abs(q.ele - rec.ref) >= 3) { q.ele > rec.ref ? rec.gain += q.ele - rec.ref : rec.loss += rec.ref - q.ele; rec.ref = q.ele; }
  }
  if (dt > 0) { const v = d / dt; rec.v = rec.v ? rec.v * .6 + v * .4 : v; if (v > .3) rec.moving += Math.min(dt, 30); }
  rec.dist += d; rec.pts.push(q); line.addLatLng([q.lat, q.lon]);
  if (rec.pts.length % 5 === 0) save();
  draw();
}
const lock = async () => { try { wl = await navigator.wakeLock.request('screen'); } catch { toast('Could not keep the screen on. Keep Switchback open while hiking.'); } };
const unlock = () => { wl?.release(); wl = null; };
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
  else if (rec?.state === 'rec' && (!wl || wl.released)) lock();
});
setInterval(() => {
  if (!rec) return; const n = Date.now();
  if (rec.state === 'rec') {
    rec.elapsed += n - rec.tick;
    if (last && n - last.timestamp > 15e3) chip('No GPS signal', 'bad');
    if (n - (rec.pts.at(-1)?.t || n) > 1e4) rec.v *= .9;
  }
  rec.tick = n; draw();
}, 1000);

function begin() {
  line?.remove(); line = L.polyline(rec.pts.map(q => [q.lat, q.lon]), {color: TRACK, weight: 6, opacity: .9}).addTo(map);
  view('rec'); pauseUI(rec.state !== 'rec');
  if (rec.state === 'rec') lock();
  save(); draw();
}
$('#start').onclick = async () => {
  if (!await ensureGeo()) return;
  rec = {id: crypto.randomUUID(), startedAt: Date.now(), state: 'rec', pts: [], dist: 0, gain: 0, loss: 0, moving: 0, elapsed: 0, tick: Date.now(), v: 0, ref: null, sm: null};
  begin();
};
$('#pause').onclick = async () => {
  if (rec.state === 'rec') { rec.state = 'paused'; unlock(); save(); pauseUI(true); }
  else { if (!await ensureGeo()) return; rec.state = 'rec'; rec.tick = Date.now(); lock(); pauseUI(false); }
};
$('#stop').onclick = async () => { if (await ask('Finish this hike?', 'Your track will be saved on this device.', 'Finish', 'Keep going')) finish(rec); };
async function finish(r) {
  unlock(); $('#mini').textContent = ''; line?.remove(); line = null; rec = null; await db.delete('draft', 'cur');
  if (r.pts.length < 2) { toast('Too short to save. Nothing was recorded.'); view('idle'); return; }
  const h = {id: r.id, name: 'Hike, ' + new Date(r.startedAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}), date: r.startedAt, pts: r.pts, dist: r.dist, gain: r.gain, loss: r.loss, moving: r.moving, elapsed: r.elapsed};
  await db.put('hikes', h); toast('Hike saved'); detail(h);
}

/* ---------- saved hikes ---------- */
function thumb(p) {
  const k = Math.cos(p[0].lat * Math.PI / 180), xs = p.map(q => q.lon * k), ys = p.map(q => -q.lat);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), s = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0) || 1e-9;
  return `<svg viewBox="-.06 -.06 1.12 1.12" aria-hidden="true"><polyline points="${p.map((_, i) => `${((xs[i] - x0) / s).toFixed(3)},${((ys[i] - y0) / s).toFixed(3)}`).join(' ')}" fill="none" stroke="currentColor" stroke-width=".05" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
async function list() {
  const hs = (await db.getAll('hikes')).sort((a, b) => b.date - a.date);
  $('#items').innerHTML = hs.length ? hs.map(h => `<li><button class="item" data-id="${h.id}">${thumb(h.pts)}<span><b>${esc(h.name)}</b><br><small><span>${new Date(h.date).toLocaleDateString()}</span><span>${fD(h.dist)}</span><span>${fT(h.elapsed / 1e3)}</span><span>+${fE(h.gain)}</span></small></span></button></li>`).join('')
    : '<li class="mute">No hikes yet. Tap Start hike to record your first one.</li>';
  view('list');
}
$('#saved').onclick = list; $('#lback').onclick = () => view('idle');
$('#items').onclick = async e => { const b = e.target.closest('[data-id]'); if (b) detail(await db.get('hikes', b.dataset.id)); };

function detail(h) {
  layer?.remove(); view('det'); setFollow(false);
  const ll = h.pts.map(q => [q.lat, q.lon]);
  layer = L.layerGroup([L.polyline(ll, {color: TRACK, weight: 5}),
    L.circleMarker(ll[0], {radius: 9, color: '#fff', fillColor: '#2e7d32', fillOpacity: 1}),
    L.circleMarker(ll.at(-1), {radius: 9, color: '#fff', fillColor: '#b3261e', fillOpacity: 1})]).addTo(map);
  map.fitBounds(ll, {paddingTopLeft: [30, 70], paddingBottomRight: [30, innerHeight * .5], animate: !RM});
  $('#v-det').innerHTML = `<label>Name<input id="nm" value="${esc(h.name)}" maxlength="80"></label>
    <div class="grid">${[['Distance', fD(h.dist)], ['Time', fT(h.elapsed / 1e3)], ['Moving time', fT(h.moving)], ['Gain / loss', `+${fE(h.gain)} / \u2212${fE(h.loss)}`]].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>
    <canvas id="cv" role="img" aria-label="Elevation profile"></canvas>
    <div class="row"><button class="btn" id="back"><svg class="i"><use href="#i-back"/></svg>Back</button><button class="btn" id="exp"><svg class="i"><use href="#i-share"/></svg>Export</button><button class="btn danger" id="del"><svg class="i"><use href="#i-trash"/></svg>Delete</button></div>`;
  profile($('#cv'), h.pts);
  $('#nm').onchange = async e => { h.name = e.target.value.trim() || h.name; await db.put('hikes', h); };
  $('#back').onclick = () => { layer.remove(); list(); };
  $('#exp').onclick = () => share(h);
  $('#del').onclick = async () => { if (await ask('Delete this hike?', 'This cannot be undone.', 'Delete', 'Keep')) { await db.delete('hikes', h.id); layer.remove(); list(); } };
}
function profile(cv, pts) {
  const r = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight, g = cv.getContext('2d'), cs = getComputedStyle(cv);
  cv.width = W * r; cv.height = H * r; g.scale(r, r); g.font = '12px system-ui'; g.fillStyle = cs.color;
  const e = pts.filter(q => q.ele != null);
  if (e.length < 2) { g.fillText('No elevation data', 10, 24); return; }
  const xs = [0]; e.forEach((q, i) => i && xs.push(xs[i - 1] + map.distance([e[i - 1].lat, e[i - 1].lon], [q.lat, q.lon])));
  const lo = Math.min(...e.map(q => q.ele)), hi = Math.max(...e.map(q => q.ele)), sp = Math.max(hi - lo, 10);
  const trk = getComputedStyle(document.documentElement).getPropertyValue('--track').trim();
  g.beginPath(); e.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](xs[i] / xs.at(-1) * W, H - 18 - (q.ele - lo) / sp * (H - 40)));
  g.strokeStyle = trk; g.lineWidth = 2.5; g.stroke(); g.lineTo(W, H); g.lineTo(0, H);
  g.globalAlpha = .25; g.fillStyle = trk; g.fill(); g.globalAlpha = 1; g.fillStyle = cs.color;
  g.fillText(fE(hi), 6, 14); g.fillText(`${fE(lo)} low, ${fD(xs.at(-1))} total`, 6, H - 4);
}

/* ---------- GPX export ---------- */
const gpx = h => `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Switchback" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${esc(h.name)}</name><time>${new Date(h.date).toISOString()}</time></metadata><trk><name>${esc(h.name)}</name><trkseg>
${h.pts.map(q => `<trkpt lat="${q.lat}" lon="${q.lon}">${q.ele != null ? `<ele>${q.ele.toFixed(1)}</ele>` : ''}<time>${new Date(q.t).toISOString()}</time></trkpt>`).join('\n')}
</trkseg></trk></gpx>`;
async function share(h) {
  const f = new File([gpx(h)], h.name.replace(/[^\w-]+/g, '_') + '.gpx', {type: 'application/gpx+xml'});
  if (navigator.canShare?.({files: [f]})) { try { await navigator.share({files: [f], title: h.name}); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1e4);
}

/* ---------- units, service worker, crash recovery ---------- */
$('#ut').textContent = imp ? 'mi' : 'km';
$('#units').onclick = () => { imp = !imp; localStorage.units = imp ? 'imp' : 'met'; $('#ut').textContent = imp ? 'mi' : 'km'; draw(); };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

// Location already allowed: start tracking right away and keep the map centered on you.
navigator.permissions?.query({name: 'geolocation'}).then(s => { if (s.state === 'granted') ensureGeo(); }).catch(() => {});

const d = await db.get('draft', 'cur');
if (d?.pts.length > 1) {
  if (await ask('Resume your hike?', 'Switchback found an unfinished recording from ' + new Date(d.startedAt).toLocaleString() + '.', 'Resume', 'Save it')) {
    rec = {...d, state: 'paused', tick: Date.now()}; begin(); map.fitBounds(line.getBounds(), {animate: false});
  } else await finish(d);
} else if (d) await db.delete('draft', 'cur');
