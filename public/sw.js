const CACHE_NAME = "steemmaze-v1";

// Assets to cache immediately for offline capability
const PRECACHE_ASSETS = ["/", "/index.html", "/logo.png", "/favicon.png"];

// Runtime caching rule: Cache audio, textures, and bundled code as they are used
const ASSET_EXTENSIONS = [
  ".mp3",
  ".png",
  ".jpg",
  ".jpeg",
  ".glb",
  ".gltf",
  ".css",
  ".js",
  ".json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }),
  );
  self.skipWaiting(); // Activate new SW immediately
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName); // Clean up old caches
          }
        }),
      );
    }),
  );
  self.clients.claim(); // Take control of all open clients
});

self.addEventListener("fetch", (event) => {
  // Skip cross-origin requests (like steem APIs) to avoid opaque response issues
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Strategy: Stale-While-Revalidate for game logic, Cache First for assets
  const url = new URL(event.request.url);
  const isAsset = ASSET_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));

  if (isAsset) {
    // Cache First for Assets (Audio, Images, Models)
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((response) => {
          // Clone the response to put one in cache
          if (
            !response ||
            response.status !== 200 ||
            response.type !== "basic"
          ) {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      }),
    );
  } else {
    // Network First for everything else (HTML, JS, API calls)
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      }),
    );
  }
});
