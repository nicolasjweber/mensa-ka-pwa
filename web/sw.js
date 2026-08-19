const SHELL_CACHE = "mensa-ka-pwa-shell-v63";
const IMAGE_CACHE = "mensa-ka-pwa-images-v1";
const MAX_IMAGE_CACHE_ENTRIES = 120;

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icons/icon.svg",
  "./assets/icons/manifest-icon-192.maskable.png",
  "./assets/icons/manifest-icon-512.maskable.png",
  "./assets/icons/apple-icon-180.png",
  "./assets/icons/apple-icon-512.png",
];

const VALID_CACHES = new Set([SHELL_CACHE, IMAGE_CACHE]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (!VALID_CACHES.has(key)) {
            return caches.delete(key);
          }
          return Promise.resolve();
        }),
      ),
    ),
  );
  self.clients.claim();
});

function isImageRequest(request, url) {
  if (request.destination === "image") {
    return true;
  }
  const path = url.pathname.toLowerCase();
  return /\.(?:png|jpg|jpeg|webp|svg|gif|avif)(?:\?.*)?$/i.test(path);
}

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
      const deleteCount = keys.length - maxEntries;
      for (let i = 0; i < deleteCount; i++) {
        await cache.delete(keys[i]);
      }
    }
  } catch {
    // Ignore cache trimming errors
  }
}

async function handleImageFetch(request) {
  const imageCache = await caches.open(IMAGE_CACHE);
  const cachedResponse = await imageCache.match(request);

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && (networkResponse.ok || networkResponse.type === "opaque")) {
        imageCache.put(request, networkResponse.clone());
        void trimCache(IMAGE_CACHE, MAX_IMAGE_CACHE_ENTRIES);
      }
      return networkResponse;
    })
    .catch(() => cachedResponse);

  return cachedResponse || fetchPromise;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Handle cross-origin meal photos & images (Cache-First with network fallback)
  if (isImageRequest(request, url)) {
    event.respondWith(handleImageFetch(request));
    return;
  }

  // Handle same-origin assets and navigation (Network-First with cache fallback for instant updates)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (request.mode === "navigate") {
            const cache = await caches.open(SHELL_CACHE);
            return cache.match("./index.html");
          }
          return Response.error();
        }),
    );
  }
});
