import { waitUntil } from "cloudflare:workers";
import { building } from "$app/env";
import type { Handle } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { requestLocale } from "#lib/shared/locale";
import { viewerZone } from "#lib/shared/utils";
import { getAuth, isAuthConfigured } from "#lib/server/auth";
import { apiFailure, createRouteContext } from "#lib/server/api-response";
import {
  MAINTENANCE_MESSAGE,
  maintenanceEnabled,
} from "#lib/server/maintenance";
import {
  cacheKey,
  hasSessionCookie,
  isCacheableRequest,
  isDataRequest,
  isStorableResponse,
  publishVersion,
  resolvedSport,
} from "#lib/server/edge-cache";

const ANONYMOUS_CACHE = "public, max-age=0, must-revalidate";
const PRIVATE_CACHE = "private, no-cache";
const STORED_CACHE = "public, s-maxage=60";

function cfTimezone(request: Request): string | undefined {
  const cf = (request as Request & { cf?: { timezone?: string } }).cf;
  return typeof cf?.timezone === "string" ? cf.timezone : undefined;
}

function resolveZone(
  cookie: string | undefined,
  fromCf: string | undefined,
): string {
  if (cookie && viewerZone(cookie) === cookie) return cookie;
  if (fromCf && viewerZone(fromCf) === fromCf) return fromCf;
  return "UTC";
}

type CacheStore = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

function cacheStore(): CacheStore | undefined {
  const cache = (globalThis as { caches?: { default?: CacheStore } }).caches
    ?.default;
  return cache;
}

function cacheRequest(key: string): Request {
  return new Request(key, { method: "GET" });
}

function defer(promise: Promise<unknown>) {
  const tracked = promise.catch(() => {});
  try {
    waitUntil(tracked);
  } catch {
    void tracked;
  }
}

function withHeaders(
  response: Response,
  headers: Record<string, string>,
): Response {
  const next = new Headers(response.headers);
  for (const [name, value] of Object.entries(headers)) next.set(name, value);
  next.delete("x-mp-opt-out");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: next,
  });
}

function browserCacheControl(signedIn: boolean): string {
  return signedIn ? PRIVATE_CACHE : ANONYMOUS_CACHE;
}

function decorate(
  response: Response,
  result: "HIT" | "MISS" | "BYPASS",
  version: string,
  html: boolean,
  signedIn: boolean,
): Response {
  const headers: Record<string, string> = {
    "cache-control": browserCacheControl(signedIn),
    "x-mp-cache": result,
  };
  if (html) headers["x-mp-version"] = version;
  return withHeaders(response, headers);
}

async function store(key: string, response: Response) {
  const cache = cacheStore();
  if (!cache) return;
  const headers = new Headers(response.headers);
  headers.set("cache-control", STORED_CACHE);
  headers.delete("set-cookie");
  headers.delete("x-mp-opt-out");
  await cache.put(
    cacheRequest(key),
    new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
}

async function resolveWithEdgeCache(
  event: Parameters<Handle>[0]["event"],
  resolve: Parameters<Handle>[0]["resolve"],
): Promise<Response> {
  const requestUrl = new URL(event.request.url);
  const signedIn = event.locals.signedIn;

  if (requestUrl.pathname === "/bets" || requestUrl.pathname === "/account") {
    return new Response(null, {
      status: 308,
      headers: { location: `/you${requestUrl.search}` },
    });
  }

  const cacheable = isCacheableRequest(event.request, requestUrl, signedIn);
  let version: string | undefined;
  let key: string | undefined;

  if (cacheable) {
    const published = await publishVersion();
    version = published;
    const id = cacheKey({
      version: published,
      locale: event.locals.locale,
      zone: event.locals.zone,
      sport: resolvedSport(requestUrl, event.cookies.get("sport")),
      url: requestUrl,
    });
    key = id;
    try {
      const hit = await cacheStore()?.match(cacheRequest(id));
      if (hit) {
        const html = (hit.headers.get("content-type") ?? "").includes(
          "text/html",
        );
        return decorate(hit, "HIT", published, html, false);
      }
    } catch {
      // A cache read failure is a miss. The page still renders.
    }
  }

  const response = await resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replaceAll("%lang%", event.locals.locale),
  });

  if (
    requestUrl.pathname === "/api" ||
    requestUrl.pathname.startsWith("/api/")
  ) {
    return response;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const html = contentType.includes("text/html");
  const data = isDataRequest(requestUrl.pathname);
  if (!html && !data) return response;

  const published = version ?? (await publishVersion());
  if (cacheable && key && isStorableResponse(response, data)) {
    defer(store(key, response.clone()));
    return decorate(response, "MISS", published, html, false);
  }
  return decorate(response, "BYPASS", published, html, signedIn);
}

export const handle: Handle = async ({ event, resolve }) => {
  const requestUrl = new URL(event.request.url);
  const signedIn = hasSessionCookie(event.request.headers.get("cookie"));
  event.locals.signedIn = signedIn;
  event.locals.user = null;
  event.locals.session = null;
  event.locals.requestTime = Date.now();
  event.locals.maintenance = maintenanceEnabled();
  event.locals.locale = requestLocale(
    event.cookies.get("locale"),
    event.request.headers.get("accept-language"),
  );
  event.locals.zone = resolveZone(
    event.cookies.get("tz"),
    cfTimezone(event.request),
  );

  if (
    event.locals.maintenance &&
    event.request.method !== "GET" &&
    (requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/"))
  ) {
    const context = createRouteContext(requestUrl.pathname);
    return apiFailure("maintenance", MAINTENANCE_MESSAGE, context);
  }

  if (isAuthConfigured()) {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: event.request.headers,
    });
    if (session) {
      event.locals.session = session.session;
      event.locals.user = session.user;
    }
    return svelteKitHandler({
      auth,
      event,
      building,
      resolve: (requestEvent) => resolveWithEdgeCache(requestEvent, resolve),
    });
  }

  return resolveWithEdgeCache(event, resolve);
};
