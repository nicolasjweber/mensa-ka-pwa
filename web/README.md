# MensaApp PWA PoC

Simple progressive web app proof-of-concept for browsing meal plans from the Mensa KA API.

## Features

- Reads canteen meal plans via the Cloudflare worker GraphQL proxy
- Date navigation (defaults to today, switch with prev/next)
- Prev/next date navigation automatically skips Saturdays and Sundays
- English date display with relative labels (`Today`, `Yesterday`, `Tomorrow`)
- Canteen selector and meal search
- Price mode switch (student, employee, pupil, guest)
- Meal ratings from other users (0-5 stars + rating count)
- Meal photos from API (top-ranked image per meal, with fallback if missing)
- Fullscreen image gallery for each meal (Prev/Next buttons, arrow keys, Esc close)
- Keyboard shortcuts: `A`/`D` for previous/next day, and also previous/next image in fullscreen mode
- Mobile zoom is disabled in normal app view to avoid accidental zooming, but enabled in fullscreen image mode
- Local favorites (stored in browser localStorage)
- Installs as a PWA (manifest + service worker)
- Uses local cached data when offline and no live request succeeds

## Run locally

Serve the PWA through the Cloudflare worker so the app and `/api/` share one origin:

```powershell
cd cors-header-proxy
npx wrangler dev
```

Then open:

`http://localhost:8787`

## Deploy to Cloudflare

The worker is configured to publish this folder as static assets and keep the GraphQL proxy on `/api/`.

```powershell
cd cors-header-proxy
npx wrangler deploy
```

## Notes

- This is intentionally a lightweight PoC, not a full replacement of the Flutter app.
- GraphQL mutations are not included.
