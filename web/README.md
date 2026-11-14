# Mensa Karlsruhe PWA (`web/`)

Static Progressive Web App frontend served by the Cloudflare Worker at `/` (`wrangler.jsonc` `assets.directory`).

## Architecture

- [`index.html`](index.html): App shell markup, inline FOUC-prevention `color-scheme` initializer, header actions (theme toggle, force refresh, PWA install), canteen/price selectors, filter chips, week strip & expandable month calendar, quick line-jump nav, meal plan container, and native `<dialog id="imageModal">` lightbox.
- [`styles.css`](styles.css): Layered CSS (`@layer reset, base, theme, components, utilities`), `light-dark()` theming with `@media (prefers-color-scheme: dark)` fallbacks, container-query `.meal-item` cards (`container: meal-card / inline-size`), dietary badge styling, shimmer skeletons, and top-layer `<dialog>` entry/exit animations.
- [`app.js`](app.js): GraphQL query client against `/api/`, client-side meal filtering, week/month weekday date navigation (skipping weekends), View Transitions & accessible focus routing, `localStorage` meal & favorite persistence, touch gestures, and lightbox controls (`A`/`D` or arrow keys, pinch/double-tap zoom, swipe-to-dismiss).
- [`sw.js`](sw.js): Service Worker (`mensa-ka-pwa-shell-v65` Network-First shell cache, `mensa-ka-pwa-images-v1` Cache-First meal image cache up to 120 entries).
- [`manifest.webmanifest`](manifest.webmanifest) & `assets/icons/`: PWA manifest, maskable icons, Apple touch icons, and iOS startup splash screens.

## Local Development & Screenshots

See the root [`README.md`](../README.md) for local development (`npm run dev`), testing (`npm test`), and automatic screenshot regeneration (`npm run screenshot`).
