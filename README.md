# Switchback

Mobile-first hiking PWA. Vanilla ES modules, no build step, no backend, no accounts.
Leaflet + OpenStreetMap/OpenTopoMap, IndexedDB via `idb`, service worker for offline.

**Files:** `index.html` shell, `app.js` (map, recording, storage, GPX), `sw.js` (offline), `manifest.webmanifest`, `style.css`.

## Run locally
Geolocation needs HTTPS. `localhost` counts as secure, so on a desktop:

    npx serve .        # or: python3 -m http.server 8080

To test on a phone, use an HTTPS tunnel (`npx localtunnel --port 3000`, ngrok, or cloudflared) or deploy.
No GPS on desktop? In Chrome devtools open Sensors, set a location, then use the app as normal.

## Deploy
Static hosting only. Netlify: drag the folder into the dashboard. Vercel: `vercel --prod` from this folder (framework: Other).
GitHub Pages: push the folder and enable Pages. All paths are relative, so subpaths work.
After changing any shell file, bump `V` in `sw.js`.

## How it records
Fixes worse than 30 m accuracy and moves under 5 m are dropped. Elevation is smoothed and gain/loss uses a 3 m dead band.
The draft is saved to IndexedDB every 5 points and on page hide, and you are offered a resume after a crash.

## Location and look
If location is already allowed, Switchback starts tracking on launch and keeps you centered. Dragging the map pauses following; the arrow button resumes it.
Icons are inline SF-style SVGs. Apple's SF Symbols license doesn't allow them on the web, so they can't be bundled here.

## Mapbox Outdoors (optional)
Mapbox's Outdoors style (trails, contours, hillshade) needs an access token, so it only appears when you set one.
1. Create a Mapbox account and copy a **public** token (`pk.`). Never use a secret `sk.` token in a browser app.
2. In the Mapbox dashboard, restrict that token to your site's URL (for example your Vercel domain).
3. Paste it into `config.js` and redeploy. Outdoors then becomes the default layer, and the layers button cycles OSM, OpenTopoMap and Outdoors.
Mapbox tiles are billed per request after a free monthly allowance (see mapbox.com/pricing). The service worker does not cache them, so this layer needs a connection. Check Mapbox's current attribution rules before launch.

## Tiles
Tiles load only for the area you view, cache-first, capped at 1,500. There is no bulk prefetching. Attribution stays visible top-right.
For heavy public use, switch to your own tile provider (see the OSM tile usage policy).

## Known limitations
- Browsers pause GPS when the screen locks or the tab is hidden. Switchback holds a Screen Wake Lock while recording, so keep it open and in front.
- iOS Safari ignores SVG home-screen icons. Add 180, 192 and 512 px PNGs and list them in the manifest.
- Not yet built: GPX import, "Trails nearby" (Overpass), "Download this area", and hike notes.
