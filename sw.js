const CACHE_NAME = "bitefact-v10";

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

self.addEventListener("fetch", event => {
  if (new URL(event.request.url).pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response =>
      response || fetch(event.request)
    )
  );
});
