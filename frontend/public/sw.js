// Kalvia Health service worker
// Scope: static app-shell caching only. API responses (patient/case/payment
// data) are never cached here — every /api/ request always goes to the
// network so users never see stale or offline-cached health data.

const CACHE_VERSION = "kalvia-shell-v1";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept API calls — always hit the network, never cache PHI.
  if (url.pathname.startsWith("/api/")) return;

  // Cross-origin requests (e.g. a separate API host, Google Fonts): let the
  // browser handle them natively rather than caching third-party responses.
  if (url.origin !== self.location.origin) return;

  // App shell: network-first so users get the latest build when online,
  // falling back to cache when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});
