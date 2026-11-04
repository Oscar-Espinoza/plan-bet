import { waitUntil } from "cloudflare:workers";
import type { RequestHandler } from "./$types";

const FILE = /^[A-Za-z0-9_-]+\.(?:svg|png)$/;
const ORIGIN = "https://crests.football-data.org";
const MAX_BYTES = 512 * 1024;

type CacheStore = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

function cacheStore(): CacheStore | undefined {
  return (globalThis as { caches?: { default?: CacheStore } }).caches?.default;
}

type CrestInit = RequestInit & {
  cf?: { cacheEverything?: boolean; cacheTtl?: number };
};

export const GET: RequestHandler = async ({ params, url }) => {
  const file = params.file ?? "";
  if (!FILE.test(file)) return new Response(null, { status: 404 });

  const key = new Request(new URL(`/crests/fd/${file}`, url.origin), {
    method: "GET",
  });
  const cache = cacheStore();
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) return hit;
    } catch {
      // A cache read failure still fetches the crest.
    }
  }

  let upstream: Response;
  try {
    const init: CrestInit = {
      redirect: "manual",
      cf: { cacheEverything: true, cacheTtl: 2_592_000 },
    };
    upstream = await fetch(`${ORIGIN}/${file}`, init);
  } catch {
    return new Response(null, { status: 502 });
  }
  if (upstream.status !== 200) {
    return new Response(null, { status: upstream.status === 404 ? 404 : 502 });
  }
  const type = (upstream.headers.get("content-type") ?? "")
    .split(";")[0]!
    .trim();
  if (!type.startsWith("image/")) return new Response(null, { status: 502 });

  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    return new Response(null, { status: 502 });
  }
  const headers = new Headers();
  headers.set("content-type", type);
  headers.set("cache-control", "public, max-age=2592000");
  const response = new Response(bytes, { status: 200, headers });
  if (cache) {
    const stored = response.clone();
    try {
      waitUntil(cache.put(key, stored));
    } catch {
      void cache.put(key, stored).catch(() => {});
    }
  }
  return response;
};
