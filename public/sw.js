// Service Worker for Ticketera PWA
const VERSION = new URL(self.location.href).searchParams.get("v") || "v1";
const SHELL_CACHE = `tt-shell-${VERSION}`;

// Core application shell entry points
const APP_SHELL = [
  "/",
  "/products",
  "/compare",
  "/stores",
  "/icon-192.png",
  "/icon-maskable-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

const SHELL_PATHS = new Set([
  "/",
  "/products",
  "/compare",
  "/stores",
  "/my-receipts",
  "/my-stats",
  "/upload",
  "/login",
]);

function isShellNavigation(url) {
  return SHELL_PATHS.has(url.pathname);
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".ico")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn("[SW] Pre-cache error:", err);
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("tt-") && key !== SHELL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_SHELL" || !Array.isArray(event.data.urls)) return;

  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(
        event.data.urls
          .filter((url) => typeof url === "string" && url.startsWith("/"))
          .filter((url) => {
            try {
              const parsed = new URL(url, self.location.origin);
              return isShellNavigation(parsed) || isStaticAsset(parsed);
            } catch {
              return false;
            }
          })
          .map(async (url) => {
            try {
              await cache.add(url);
            } catch {
              // Ignore transient asset replacements
            }
          })
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Only handle requests from the same origin
  if (url.origin !== self.location.origin) {
    return;
  }

  // 2. Bypass API, authentication, file streaming, and non-GET requests (e.g. POST /upload-share)
  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/upload-share")
  ) {
    return;
  }

  // 3. Static assets: Cache-first
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // 4. Page navigations: Network-first with cache fallback
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached || new Response("Asset offline", { status: 503 });
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && isShellNavigation(new URL(request.url))) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await cache.match("/");
    return (
      fallback ||
      new Response("You are offline", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      })
    );
  }
}
