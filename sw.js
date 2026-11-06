const CACHE_NAME = "bitefact-v13-cloudrun";

const FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "plans.js",
  "permissions.js",
  "manifest.json",
  "assets/logo.png",
  "assets/button-logo.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith("bitefact-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Network-first: a stale cache must never fossilize the app again (the
// v12-maintenance worker cached maintenance HTML in place of style.css
// and served it forever). Fresh copies are cached as they arrive; the
// cache is only a fallback for when the network is unreachable.
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") {
    return;
  }

  if (new URL(event.request.url).pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
