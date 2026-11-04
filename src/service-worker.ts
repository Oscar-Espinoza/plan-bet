/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { self } from "$app/service-worker";
import { version } from "$app/env";
import { immutable, assets } from "$app/manifest";
import { asset } from "$app/paths";

const CACHE = `matchday-${version}`;
const OFFLINE_HOME = `${CACHE}:home`;

const SESSION_MARKERS = [
  "better-auth.session_token=",
  "__Secure-better-auth.session_token=",
];

function immutablePath(relative: string) {
  return relative.startsWith("/") ? relative : `/${relative}`;
}

const IMMUTABLE: string[] = [
  ...immutable.map((entry) => immutablePath(entry.path)),
  ...assets.map((entry) => asset(entry.path)),
];

function hasSessionCookie(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  return SESSION_MARKERS.some((marker) => cookie.includes(marker));
}

function isHtmlNavigation(request: Request) {
  return (
    request.mode === "navigate" ||
    (request.headers.get("accept") ?? "").includes("text/html")
  );
}

function isAppData(url: URL) {
  return url.pathname.includes("__data.json");
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(IMMUTABLE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("matchday-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (hasSessionCookie(event.request)) return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (IMMUTABLE.includes(url.pathname) || url.pathname.startsWith("/fonts/")) {
    event.respondWith(cacheFirst(event.request, url.pathname));
    return;
  }

  if (isHtmlNavigation(event.request) || isAppData(url)) {
    event.respondWith(networkFirstPage(event.request, url));
  }
});

async function cacheFirst(
  request: Request,
  pathname: string,
): Promise<Response> {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(pathname);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(pathname, response.clone());
  return response;
}

async function networkFirstPage(request: Request, url: URL): Promise<Response> {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.status !== 206) {
      await cache.put(request, response.clone());
      if (url.pathname === "/" && isHtmlNavigation(request)) {
        await cache.put(OFFLINE_HOME, response.clone());
      }
    }
    return response;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (isHtmlNavigation(request)) {
      const home = await cache.match(OFFLINE_HOME);
      if (home) return home;
    }
    return Response.error();
  }
}
