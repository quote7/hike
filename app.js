import {openDB} from 'https://cdn.jsdelivr.net/npm/idb@8.0.0/+esm';
import {MAPBOX_TOKEN} from './config.js';

const $ = s => document.querySelector(s), p2 = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
const RM = matchMedia('(prefers-reduced-motion:reduce)').matches;
const TRACK = '#ff2d55';
const RECORD_TRACK = '#1685ff';
const theme = localStorage.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
document.documentElement.dataset.theme = theme;
const db = await openDB('switchback', 1, {upgrade(d) { d.createObjectStore('hikes', {keyPath: 'id'}); d.createObjectStore('draft'); }});
let units = ['met', 'imp', 'naut'].includes(localStorage.units) ? localStorage.units : 'met';

/* ---------- formatting ---------- */
const fD = m => units === 'imp' ? (m / 1609.344).toFixed(2) + ' mi' : units === 'naut' ? (m / 1852).toFixed(2) + ' nmi' : (m / 1000).toFixed(2) + ' km';
const fE = m => units !== 'met' ? Math.round(m * 3.281) + ' ft' : Math.round(m) + ' m';
const fT = s => { s = Math.round(s); const h = s / 3600 | 0, m = s % 3600 / 60 | 0; return h ? `${h}:${p2(m)}:${p2(s % 60)}` : `${m}:${p2(s % 60)}`; };
const fP = v => v > .3 ? fT((units === 'imp' ? 1609.344 : units === 'naut' ? 1852 : 1000) / v) + (units === 'imp' ? ' /mi' : units === 'naut' ? ' /nmi' : ' /km') : '\u2013';
const fS = v => (v * (units === 'imp' ? 2.237 : units === 'naut' ? 1.94384 : 3.6)).toFixed(1) + (units === 'imp' ? ' mph' : units === 'naut' ? ' kn' : ' km/h');
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
const mapbox = () => L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`,
  {tileSize: 512, zoomOffset: -1, maxZoom: 20, attribution: '\u00a9 <a href="https://www.mapbox.com/about/maps/">Mapbox</a> \u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors <a href="https://www.mapbox.com/map-feedback/"><b>Improve this map</b></a>'});
const openStreetMap = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  {maxZoom: 19, crossOrigin: true, attribution: '\u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
let mapProvider = localStorage.mapProvider === 'osm' || !MAPBOX_TOKEN ? 'osm' : 'mapbox';
let baseLayer = (mapProvider === 'mapbox' ? mapbox() : openStreetMap()).addTo(map);
function chooseMapProvider(provider) {
  if (provider === 'mapbox' && !MAPBOX_TOKEN) { toast('Add a Mapbox public token to config.js first.'); return; }
  map.removeLayer(baseLayer);
  mapProvider = provider;
  baseLayer = (provider === 'mapbox' ? mapbox() : openStreetMap()).addTo(map);
  weatherLayer?.bringToFront();
  localStorage.mapProvider = provider;
  $('#mapbox-layer').setAttribute('aria-pressed', provider === 'mapbox');
  $('#osm-layer').setAttribute('aria-pressed', provider === 'osm');
}

let weatherEnabled = localStorage.weatherOverlay === '1', weatherLayer = null, weatherRequest = 0;
function removeWeatherLayer() {
  weatherRequest++;
  weatherLayer?.remove();
  weatherLayer = null;
}
async function refreshWeatherOverlay() {
  if (!weatherEnabled || $('#map').hidden) return;
  const request = ++weatherRequest;
  try {
    const response = await fetch('https://api.rainviewer.com/public/weather-maps.json', {cache: 'no-store'});
    if (!response.ok) throw new Error(`RainViewer returned HTTP ${response.status}.`);
    const data = await response.json();
    const frame = data.radar?.past?.at(-1);
    const host = new URL(data.host);
    if (host.protocol !== 'https:' || host.hostname !== 'tilecache.rainviewer.com' || !/^\/v2\/radar\/[a-f\d]+$/i.test(frame?.path || '')) {
      throw new Error('RainViewer returned an invalid radar frame.');
    }
    if (request !== weatherRequest || !weatherEnabled || $('#map').hidden) return;
    const nextLayer = L.tileLayer(`${host.origin}${frame.path}/512/{z}/{x}/{y}/2/1_0.png`, {
      tileSize: 512, zoomOffset: -1, maxNativeZoom: 8, maxZoom: 19, opacity: .4,
      attribution: '<a href="https://www.rainviewer.com/">RainViewer</a>'
    });
    nextLayer.once('tileerror', error => {
      if (weatherLayer === nextLayer) {
        toast('RainViewer precipitation tiles could not be loaded. Try again later.');
        console.error('Could not load RainViewer precipitation tiles.', error);
      }
    });
    weatherLayer?.remove();
    weatherLayer = nextLayer.addTo(map);
  } catch (error) {
    if (request === weatherRequest && weatherEnabled && !$('#map').hidden) {
      toast('Could not get RainViewer radar data. Try again later.');
      console.error('Could not load the RainViewer radar overlay.', error);
    }
  }
}
function setWeatherEnabled(enabled) {
  weatherEnabled = enabled;
  localStorage.weatherOverlay = enabled ? '1' : '0';
  $('#weather-off').setAttribute('aria-pressed', !enabled);
  $('#weather-on').setAttribute('aria-pressed', enabled);
  if (enabled) refreshWeatherOverlay();
  else removeWeatherLayer();
}
$('#weather-off').onclick = () => setWeatherEnabled(false);
$('#weather-on').onclick = () => setWeatherEnabled(true);
$('#weather-off').setAttribute('aria-pressed', !weatherEnabled);
$('#weather-on').setAttribute('aria-pressed', weatherEnabled);
setInterval(() => {
  if (weatherEnabled && !$('#map').hidden) refreshWeatherOverlay();
}, 10 * 60 * 1000);

let me, ring;
function dot(c) {
  const ll = [c.latitude, c.longitude];
  if (!me) {
    ring = L.circle(ll, {radius: c.accuracy, weight: 1, color: '#1a73e8', fillOpacity: .12}).addTo(map);
    me = L.circleMarker(ll, {radius: 9, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1}).addTo(map);
  } else { me.setLatLng(ll); ring.setLatLng(ll).setRadius(c.accuracy); }
}

/* ---------- GPS ---------- */
let wid = null, first = true, follow = true, last = null, rec = null, line = null, wl = null, layer = null, imported = null, importedLayer = null;
const setFollow = f => { follow = f; $('#loc').classList.toggle('on', f); $('#loc').setAttribute('aria-pressed', f); };
map.on('dragstart', () => setFollow(false));   // dragging the map stops following; the locate button resumes
const chip = (t, c = '') => { const e = $('#gps'); e.textContent = t; e.className = 'chip ' + c; };
const quality = a => chip(`GPS ${a <= 15 ? 'good' : a <= 30 ? 'fair' : 'weak'}, \u00b1${fE(a)}`, a <= 15 ? 'ok' : a <= 30 ? 'warn' : 'bad');
let currentConditions = null, weatherLocation = null, weatherLookupAt = 0, weatherLookup = 0;
const weatherDescriptions = code => {
  if (code === 0) return ['Clear', '#i-weather-sun'];
  if (code === 1 || code === 2) return ['Partly cloudy', '#i-weather-partly'];
  if (code === 3) return ['Overcast', '#i-weather-cloud'];
  if (code === 45 || code === 48) return ['Fog', '#i-weather-fog'];
  if (code >= 51 && code <= 67 || code >= 80 && code <= 82) return ['Rain', '#i-weather-rain'];
  if (code >= 71 && code <= 77 || code === 85 || code === 86) return ['Snow', '#i-weather-snow'];
  if (code >= 95 && code <= 99) return ['Thunderstorm', '#i-weather-storm'];
  return ['Conditions unavailable', '#i-weather-cloud'];
};
function renderLocalWeather(message = '') {
  const text = $('#weather-text'), icon = $('#weather-icon');
  if (!currentConditions) {
    text.textContent = message || 'Weather unavailable';
    icon.setAttribute('href', '#i-weather-cloud');
    return;
  }
  const [condition, symbol] = weatherDescriptions(currentConditions.code);
  const temperature = Math.round(units === 'imp' ? currentConditions.temperature * 9 / 5 + 32 : currentConditions.temperature);
  text.textContent = `${temperature}°${units === 'imp' ? 'F' : 'C'} · ${condition}`;
  icon.setAttribute('href', symbol);
}
async function refreshLocalWeather(latitude, longitude) {
  const point = [latitude, longitude];
  if (weatherLocation && map.distance(weatherLocation, point) < 10000 && Date.now() - weatherLookupAt < 10 * 60 * 1000) return;
  weatherLocation = point;
  weatherLookupAt = Date.now();
  const request = ++weatherLookup;
  if (!currentConditions) renderLocalWeather('Loading weather…');
  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'temperature_2m,weather_code',
      temperature_unit: 'celsius',
      timezone: 'auto'
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}.`);
    const data = await response.json();
    const temperature = data.current?.temperature_2m, code = data.current?.weather_code;
    if (!Number.isFinite(temperature) || !Number.isInteger(code)) throw new Error('Open-Meteo returned invalid current conditions.');
    if (request !== weatherLookup) return;
    currentConditions = {temperature, code};
    renderLocalWeather();
  } catch (error) {
    if (request === weatherLookup) {
      currentConditions = null;
      renderLocalWeather('Weather unavailable');
      console.error('Could not load current local weather.', error);
    }
  }
}

function onErr(e) {
  if (e.code === 1) {
    chip('Location blocked', 'bad');
    if (!currentConditions) renderLocalWeather('Weather needs GPS');
    toast('Location is blocked. Allow it in your browser site settings, then reload.');
    if (wid != null) { navigator.geolocation.clearWatch(wid); wid = null; }
  } else {
    chip(e.code === 2 ? 'No GPS signal' : 'Searching for GPS\u2026', 'warn');
    if (!currentConditions) renderLocalWeather('Weather needs GPS');
  }
}
async function ensureGeo() {
  if (wid != null) return true;
  if (!navigator.geolocation) { chip('GPS unavailable', 'bad'); renderLocalWeather('Weather needs GPS'); toast('This device has no geolocation support.'); return false; }
  let st; try { st = await navigator.permissions.query({name: 'geolocation'}); } catch {}
  if (st?.state === 'denied') { onErr({code: 1}); return false; }
  chip('Searching for GPS\u2026', 'warn');
  wid = navigator.geolocation.watchPosition(onFix, onErr, {enableHighAccuracy: true, maximumAge: 0, timeout: 20000});
  return true;
}
function onFix(p) {
  const c = p.coords; last = p; quality(c.accuracy); dot(c);
  refreshLocalWeather(c.latitude, c.longitude);
  if (follow) { const ll = [c.latitude, c.longitude]; first ? map.setView(ll, 16, {animate: false}) : map.panTo(ll, {animate: !RM, duration: .8}); }
  first = false;
  if (rec?.state === 'rec') add({lat: c.latitude, lon: c.longitude, ele: c.altitude, t: p.timestamp, acc: c.accuracy});
}
$('#loc').onclick = async () => { if (!await ensureGeo()) return; setFollow(true); if (last) map.setView([last.coords.latitude, last.coords.longitude], Math.max(map.getZoom(), 16), {animate: !RM}); };

/* ---------- GPX import ---------- */
function parseGPX(text, filename) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('This file is not valid GPX.');
  const nodes = name => [...doc.getElementsByTagName('*')].filter(n => n.localName === name);
  const points = node => [...node.children].filter(n => n.localName === 'trkpt' || n.localName === 'rtept').map(n => {
    const latText = n.getAttribute('lat'), lonText = n.getAttribute('lon');
    if (latText == null || lonText == null) return null;
    const lat = Number(latText), lon = Number(lonText);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const child = name => [...n.children].find(c => c.localName === name)?.textContent;
    const ele = Number(child('ele')), time = Date.parse(child('time'));
    return {lat, lon, ele: Number.isFinite(ele) ? ele : null, t: Number.isFinite(time) ? time : 0};
  }).filter(Boolean);
  let segments = nodes('trkseg').map(points).filter(s => s.length);
  if (!segments.length) segments = nodes('rte').map(points).filter(s => s.length);
  if (!segments.length) {
    const all = points(doc);
    if (all.length) segments = [all];
  }
  const flat = segments.flat();
  if (flat.length < 2) throw new Error('At least two valid route points are required.');
  const names = nodes('name');
  const name = names.find(n => n.textContent.trim())?.textContent.trim() || filename.replace(/\.gpx$/i, '') || 'Imported route';
  const dist = segments.reduce((sum, segment) => sum + segment.slice(1).reduce((part, point, i) => part + map.distance([segment[i].lat, segment[i].lon], [point.lat, point.lon]), 0), 0);
  return {name, segments, points: flat, dist};
}
function showImported() {
  const coords = imported.points.map(q => [q.lat, q.lon]);
  importedLayer?.remove();
  importedLayer = L.layerGroup([
    ...imported.segments.map(segment => L.polyline(segment.map(q => [q.lat, q.lon]), {color: TRACK, weight: 6, opacity: .9})),
    L.circleMarker(coords[0], {radius: 8, color: '#fff', fillColor: '#2e7d32', fillOpacity: 1}),
    L.circleMarker(coords.at(-1), {radius: 8, color: '#fff', fillColor: '#b3261e', fillOpacity: 1})
  ]).addTo(map);
  $('#route-name').textContent = imported.name;
  $('#route-distance').textContent = fD(imported.dist);
  view('gpx');
}
function fitImportedRoute() {
  setFollow(false);
  return new Promise(resolve => requestAnimationFrame(() => {
    map.stop();
    map.invalidateSize({pan: false});
    const bottomInset = innerHeight - $('#sheet').getBoundingClientRect().top + 16;
    map.fitBounds(L.latLngBounds(imported.points.map(q => [q.lat, q.lon])), {paddingTopLeft: [24, 72], paddingBottomRight: [24, bottomInset], maxZoom: 16, animate: !RM});
    resolve();
  }));
}
$('#import').onclick = () => $('#gpx-file').click();
$('#gpx-file').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  setFollow(false);
  try {
    imported = parseGPX(await file.text(), file.name);
    await openMap('gpx'); showImported(); await fitImportedRoute();
  } catch (err) { toast(err.message || 'Could not read this GPX file.'); }
};
$('#start-trail').onclick = () => startRecording('gpx');
$('#clear-route').onclick = () => { importedLayer?.remove(); importedLayer = imported = null; setFollow(false); view('idle'); };

/* ---------- recording ---------- */
const F = [['Distance', r => fD(r.dist)], ['Time', r => fT(r.elapsed / 1e3)], ['Moving time', r => fT(r.moving)], ['Pace', r => fP(r.v)],
  ['Average pace', r => fP(r.moving ? r.dist / r.moving : 0)], ['Speed', r => fS(r.v)], ['Average speed', r => fS(r.moving ? r.dist / r.moving : 0)], ['Gain / loss', r => `+${fE(r.gain)} / \u2212${fE(r.loss)}`]];
$('#stats').innerHTML = F.map(([k], i) => `<div><small>${k}</small><b id="s${i}">\u2013</b></div>`).join('');
const draw = () => { if (!rec) return; F.forEach(([, f], i) => $('#s' + i).textContent = f(rec)); $('#mini').innerHTML = `<span>${fD(rec.dist)}</span><span>${fT(rec.elapsed / 1e3)}</span>`; };
const save = () => rec && db.put('draft', {...rec}, 'cur');
const view = v => { document.querySelectorAll('.view').forEach(e => e.hidden = e.id !== 'v-' + v); if (v !== 'rec') setCollapsed(false); };
async function openMap(v = 'idle') {
  $('#main-menu').hidden = true; $('#settings-screen').hidden = true;
  $('#map').hidden = false; $('#sheet').hidden = false; $('#status-bar').hidden = false; $('#gps').hidden = false;
  view(v);
  await new Promise(resolve => requestAnimationFrame(() => {
    map.invalidateSize({pan: false});
    resolve();
  }));
  refreshWeatherOverlay();
}
function openHome() {
  removeWeatherLayer();
  $('#map').hidden = true; $('#sheet').hidden = true; $('#status-bar').hidden = true; $('#gps').hidden = true;
  $('#settings-screen').hidden = true; $('#main-menu').hidden = false;
}
$('#main-menu-back').onclick = openHome;
$('#route-menu-back').onclick = openHome;
$('#view-map').onclick = async () => {
  await openMap('idle');
  setFollow(true);
  if (!await ensureGeo()) return;
  if (last) map.setView([last.coords.latitude, last.coords.longitude], Math.max(map.getZoom(), 16), {animate: !RM});
};
$('#blank-hike').onclick = () => startRecording('idle');
$('#settings-open').onclick = () => { $('#main-menu').hidden = true; $('#settings-screen').hidden = false; };
$('#settings-back').onclick = () => { $('#settings-screen').hidden = true; $('#main-menu').hidden = false; };
function setTheme(value) {
  document.documentElement.dataset.theme = value;
  localStorage.theme = value;
  $('#theme-light').setAttribute('aria-pressed', value === 'light');
  $('#theme-dark').setAttribute('aria-pressed', value === 'dark');
}
$('#theme-light').onclick = () => setTheme('light');
$('#theme-dark').onclick = () => setTheme('dark');
function setUnits(value) {
  units = value;
  localStorage.units = value;
  $('#units-metric').setAttribute('aria-pressed', value === 'met');
  $('#units-imperial').setAttribute('aria-pressed', value === 'imp');
  $('#units-nautical').setAttribute('aria-pressed', value === 'naut');
  if (imported) $('#route-distance').textContent = fD(imported.dist);
  draw();
  renderLocalWeather();
}
$('#units-metric').onclick = () => setUnits('met');
$('#units-imperial').onclick = () => setUnits('imp');
$('#units-nautical').onclick = () => setUnits('naut');
$('#mapbox-layer').onclick = () => chooseMapProvider('mapbox');
$('#osm-layer').onclick = () => chooseMapProvider('osm');
$('#theme-light').setAttribute('aria-pressed', theme === 'light');
$('#theme-dark').setAttribute('aria-pressed', theme === 'dark');
$('#units-metric').setAttribute('aria-pressed', units === 'met');
$('#units-imperial').setAttribute('aria-pressed', units === 'imp');
$('#units-nautical').setAttribute('aria-pressed', units === 'naut');
$('#mapbox-layer').setAttribute('aria-pressed', mapProvider === 'mapbox');
$('#osm-layer').setAttribute('aria-pressed', mapProvider === 'osm');
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
const lock = async () => { try { wl = await navigator.wakeLock.request('screen'); } catch { toast('Could not keep the screen on. Keep OpenTrails open while hiking.'); } };
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
  line?.remove(); line = L.polyline(rec.pts.map(q => [q.lat, q.lon]), {color: RECORD_TRACK, weight: 6, opacity: .95}).addTo(map);
  view('rec'); pauseUI(rec.state !== 'rec');
  if (rec.state === 'rec') lock();
  save(); draw();
}
async function startRecording(viewName) {
  await openMap(viewName);
  setFollow(true);
  if (!await ensureGeo()) return;
  rec = {id: crypto.randomUUID(), startedAt: Date.now(), state: 'rec', pts: [], dist: 0, gain: 0, loss: 0, moving: 0, elapsed: 0, tick: Date.now(), v: 0, ref: null, sm: null};
  begin();
}
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
<gpx version="1.1" creator="OpenTrailso" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${esc(h.name)}</name><time>${new Date(h.date).toISOString()}</time></metadata><trk><name>${esc(h.name)}</name><trkseg>
${h.pts.map(q => `<trkpt lat="${q.lat}" lon="${q.lon}">${q.ele != null ? `<ele>${q.ele.toFixed(1)}</ele>` : ''}<time>${new Date(q.t).toISOString()}</time></trkpt>`).join('\n')}
</trkseg></trk></gpx>`;
async function share(h) {
  const f = new File([gpx(h)], h.name.replace(/[^\w-]+/g, '_') + '.gpx', {type: 'application/gpx+xml'});
  if (navigator.canShare?.({files: [f]})) { try { await navigator.share({files: [f], title: h.name}); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1e4);
}

/* ---------- service worker, crash recovery ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

const d = await db.get('draft', 'cur');
if (d?.pts.length > 1) {
  await openMap('rec');
  if (await ask('Resume your hike?', 'OpenTrails found an unfinished recording from ' + new Date(d.startedAt).toLocaleString() + '.', 'Resume', 'Save it')) {
    rec = {...d, state: 'paused', tick: Date.now()}; begin(); map.fitBounds(line.getBounds(), {animate: false});
  } else await finish(d);
} else if (d) await db.delete('draft', 'cur');
