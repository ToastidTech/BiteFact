const CACHE_NAME = "bitefact-v14";

const CORE_FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "plans.js",
  "permissions.js",
  "lead-capture.js",
  "manifest.json",
  "assets/logo.png",
  "assets/button-logo.png",
  "assets/bitefact-ai-logo.jpg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith("bitefact-") && key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // API calls always go straight to the network.
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Navigations and HTML: network-first so app updates always reach the user.
  // Falls back to cache when offline.
  if (event.request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(cached => cached || caches.match("index.html"))
        )
    );
    return;
  }

  // Static assets: stale-while-revalidate — fast from cache, refreshed in the background.
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
