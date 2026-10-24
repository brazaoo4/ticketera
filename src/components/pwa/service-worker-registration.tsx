"use client";

import { useEffect } from "react";

/** Build timestamp stamped into next.config.ts and shared with the service worker */
const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION ?? "dev";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      // In dev mode, unregister leftover service workers so hot reload isn't stale
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => void registration.unregister());
      });
      if ("caches" in window) {
        void caches.keys().then((keys) => {
          keys
            .filter((key) => key.startsWith("tt-"))
            .forEach((key) => void caches.delete(key));
        });
      }
      return;
    }

    async function registerServiceWorker() {
      try {
        const registration = await navigator.serviceWorker.register(
          `/sw.js?v=${encodeURIComponent(BUILD_VERSION)}`,
          { scope: "/" }
        );

        const readyReg = await navigator.serviceWorker.ready;
        const activeWorker = readyReg.active;
        if (activeWorker) {
          const loadedAssets = performance
            .getEntriesByType("resource")
            .map((entry) => {
              try {
                return new URL(entry.name);
              } catch {
                return null;
              }
            })
            .filter(
              (url): url is URL =>
                !!url &&
                url.origin === window.location.origin &&
                url.pathname.startsWith("/_next/static/")
            )
            .map((url) => url.pathname + url.search);

          activeWorker.postMessage({
            type: "CACHE_SHELL",
            urls: Array.from(
              new Set([
                window.location.pathname + window.location.search,
                ...loadedAssets,
              ])
            ),
          });
        }

        void registration.update();
      } catch (err) {
        console.warn("[SW] Registration error:", err);
      }
    }

    void registerServiceWorker();
  }, []);

  return null;
}
