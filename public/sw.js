/*
 * GoPixel service worker — minimal, installability-focused.
 *
 * PRIVACY / STALENESS SAFETY (this app is auth-gated and serves PII):
 *   - We NEVER cache API responses (/api/*) or any authed HTML. Doing so could
 *     serve one family's private data to another session, or show stale private
 *     state. Those requests always fall straight through to the network.
 *   - We ONLY pre/runtime-cache immutable, public, static assets (the app
 *     manifest + PWA icons under /icons/). Everything else is a bare network
 *     passthrough.
 *   - Strategy for the cached statics is network-first: try the network, fall
 *     back to cache only when offline. So the cache is a resilience layer, never
 *     a source of stale private data.
 *
 * This is intentionally tiny: it exists to make the app installable and give the
 * icons/manifest an offline fallback — not to be a full offline experience.
 */

const CACHE = "pp-static-v1";

// Public, immutable assets that are safe to cache. No HTML, no /api/*.
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // Warm the cache with the static shell; skipWaiting so updates apply promptly.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => {
        /* best-effort: a failed precache must not block installation */
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Drop old cache versions and take control of open clients.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Only static assets we explicitly own are eligible for the cache path.
function isCacheableStatic(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname === "/manifest.webmanifest" ||
      url.pathname.startsWith("/icons/"))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch non-GET, cross-origin, /api/*, or anything not on our static
  // allowlist — bare passthrough so private/authed data is never cached.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (!isCacheableStatic(url)) {
    // Explicit passthrough: let the browser handle it normally.
    return;
  }

  // Network-first for our static assets; fall back to cache when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches
            .open(CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
