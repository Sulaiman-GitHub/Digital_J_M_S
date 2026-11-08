# 018: Installable app (PWA)

- Status: accepted
- Date: 2026-11-08

## Decision

The site can be installed from Chrome and Edge (and added to the home screen on Android and iOS).

- `manifest.webmanifest`: name, standalone display, brand blue theme (decision 014), icons.
- Icons (`icon-192/512.png`, maskable, `apple-touch-icon.png`) are a placeholder "DJ" mark made by
  `scripts/make_pwa_icons.py`. Replace them when a real logo exists (decision 014 leaves it open).
- `sw.js` is hand-written, so no new dependency. It precaches only `offline.html` and the icons,
  serves hashed `/assets/*` cache-first, and shows `offline.html` when a page load fails.
- It never caches `/api/*`, non-GET requests or page HTML, so no personal data is stored by the
  worker and a new deploy shows immediately. The app is not usable offline; it only fails politely.
- Registered in production builds only (`src/lib/registerServiceWorker.ts`).
- Installing needs HTTPS (or localhost); hosting is still open (question 12). Caddy already sends
  `Cache-Control: no-cache` for everything outside `/assets`, which covers `sw.js` and the manifest.
- Not built: push notifications, background sync, an in-app "Install" button (browsers show their own).
