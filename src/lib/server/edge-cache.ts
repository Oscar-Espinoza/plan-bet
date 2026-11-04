import { env } from "cloudflare:workers";
import { parseSportPreference } from "../shared/sport-preference";

/**
 * Edge HTML cache (spec §3.4).
 *
 * SvelteKit 3 still requests client navigations at `/__data.json`
 * (`@sveltejs/kit` `src/pathname.js`: `DATA_SUFFIX = '/__data.json'`, plus
 * `.html__data.json` for prerendered `.html` paths). `handle` sees
 * `event.url` with that suffix already stripped, so eligibility and the
 * cache key use the original `request.url`.
 *
 * Bypass paths:
 * - A Better Auth session cookie (`signedIn`, or the cookie on the request)
 *   makes `isCacheableRequest` false. The hook returns the rendered response
 *   with `x-mp-cache: BYPASS` and does not call `cache.match` or `cache.put`.
 * - `isStorableResponse` is false when the response carries `Set-Cookie`
 *   (also status other than 200, `Cache-Control: private|no-store`, or
 *   `x-mp-opt-out: 1`). The hook does not `cache.put` that response.
 * - A path outside the allowlist makes `isCacheableRequest` false, so the
 *   hook returns `x-mp-cache: BYPASS` and does not store.
 */

const DATA_SUFFIX = "/__data.json";
const HTML_DATA_SUFFIX = ".html__data.json";

const SESSION_COOKIES = new Set([
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
]);

const MEMO_MS = 10_000;

let versionMemo: { value: string; at: number } | undefined;

export function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    const name = (eq === -1 ? part : part.slice(0, eq)).trim();
    if (SESSION_COOKIES.has(name)) return true;
  }
  return false;
}

/** Route pathname for a document or its SvelteKit data request. */
export function pagePath(pathname: string): string {
  if (pathname.endsWith(HTML_DATA_SUFFIX)) {
    return pathname.slice(0, -HTML_DATA_SUFFIX.length) + ".html";
  }
  if (pathname.endsWith(DATA_SUFFIX)) {
    const stripped = pathname.slice(0, -DATA_SUFFIX.length);
    return stripped === "" ? "/" : stripped;
  }
  return pathname;
}

export function isDataRequest(pathname: string): boolean {
  return pathname.endsWith(DATA_SUFFIX) || pathname.endsWith(HTML_DATA_SUFFIX);
}

export function isAllowlisted(pathname: string): boolean {
  const page = pagePath(pathname);
  if (page === "/" || page === "/rules" || page === "/system") return true;
  return /^\/games\/[^/]+$/.test(page);
}

/** GET on the allowlist, and no Better Auth session cookie. */
export function isCacheableRequest(
  request: Request,
  url: URL,
  signedIn: boolean,
): boolean {
  if (signedIn) return false;
  if (request.method !== "GET") return false;
  if (hasSessionCookie(request.headers.get("cookie"))) return false;
  return isAllowlisted(url.pathname);
}

/**
 * Board filter on `/` only (query wins over the cookie). `-` everywhere else,
 * including data requests for other pages.
 */
export function resolvedSport(
  url: URL,
  sportCookie: string | undefined,
): string {
  if (pagePath(url.pathname) !== "/") return "-";
  if (url.searchParams.has("sport")) {
    return parseSportPreference(url.searchParams.get("sport"));
  }
  return parseSportPreference(sportCookie);
}

export function cacheKey({
  version,
  locale,
  zone,
  sport,
  url,
}: {
  version: string;
  locale: string;
  zone: string;
  sport: string;
  url: URL;
}): string {
  const pairs = [...url.searchParams.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0,
  );
  const query = pairs
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
  const path = `${url.pathname}${query ? `?${query}` : ""}`;
  return `https://cache.matchday.internal/v${encodeURIComponent(version)}/${encodeURIComponent(locale)}/${encodeURIComponent(zone)}/${encodeURIComponent(sport)}${path}`;
}

/** 200, no Set-Cookie, and the route did not opt out. */
export function isStorableResponse(response: Response): boolean {
  if (response.status !== 200) return false;
  if (response.headers.has("set-cookie")) return false;
  if (response.headers.get("x-mp-opt-out") === "1") return false;
  const cacheControl = response.headers.get("cache-control") ?? "";
  if (/\bprivate\b/i.test(cacheControl) || /\bno-store\b/i.test(cacheControl)) {
    return false;
  }
  return true;
}

/** `publish:version` from KV, memoized per isolate for 10s. Default `"0"`. */
export async function publishVersion(): Promise<string> {
  const now = Date.now();
  if (versionMemo && now - versionMemo.at < MEMO_MS) return versionMemo.value;
  let value = "0";
  try {
    const stored = (await env.PUBLIC?.get("publish:version"))?.trim();
    if (stored) value = stored;
  } catch {
    value = versionMemo?.value ?? "0";
  }
  versionMemo = { value, at: now };
  return value;
}
