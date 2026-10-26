# Switchback

Mobile-first hiking PWA. Vanilla ES modules, no build step, no backend, no accounts.
Leaflet + Mapbox Outdoors or OpenStreetMap, IndexedDB via `idb`, service worker for the app shell.

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
Switchback opens to a main menu. GPS is requested when you open the map or start a hike; opening the map centers it on your location. While recording, the blue line marks your travelled path; dragging the map pauses following, and the arrow button resumes it.
Appearance, distance units (kilometers, miles, or nautical miles), map provider, and weather radar overlay choices are saved on this device in Settings. Nautical miles use knots for speed and feet for elevation. OpenStreetMap and Mapbox Outdoors are available in Settings.
Icons are inline SF-style SVGs. Apple's SF Symbols license doesn't allow them on the web, so they can't be bundled here.

## Weather overlay
Enable Weather overlay in Settings to show the latest available RainViewer radar precipitation over the map. The overlay is transparent where radar detects no precipitation and uses 20% opacity. It refreshes every 10 minutes, uses 512 px radar tiles, and requires an internet connection. RainViewer requests attribution. Its free API is for personal or educational use only; review the [RainViewer API terms](https://www.rainviewer.com/api.html) before using it for other purposes.

## Mapbox Outdoors
Mapbox's Outdoors style (trails, contours, hillshade) is available alongside OpenStreetMap and needs an access token.
1. Create a Mapbox account and copy a **public** token (`pk.`). Never use a secret `sk.` token in a browser app.
2. In the Mapbox dashboard, restrict that token to your site's URL (for example your Vercel domain).
3. Paste it into `config.js` and redeploy.
Mapbox tiles are billed per request after a free monthly allowance (see mapbox.com/pricing). The service worker does not cache them, so the map needs a connection. Check Mapbox's current attribution rules before launch.

## Tiles
Tiles load only for the area you view. There is no bulk prefetching. Attribution stays visible top-right.

## GPX routes
Choose Import Trail from the main menu to load a `.gpx` route and automatically fit it on the map. Start hike records your travelled path in blue over the imported route. Imported routes are temporary and are not added to saved hikes.

## Known limitations
- Browsers pause GPS when the screen locks or the tab is hidden. Switchback holds a Screen Wake Lock while recording, so keep it open and in front.
- iOS Safari ignores SVG home-screen icons. Add 180, 192 and 512 px PNGs and list them in the manifest.
- Not yet built: "Trails nearby" (Overpass), "Download this area", and hike notes.
