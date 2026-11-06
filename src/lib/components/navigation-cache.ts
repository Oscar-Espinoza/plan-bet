import { page } from "$app/state";

// Tab-local only: private route data never goes into persistent browser storage.
const entries = new Map<
  string,
  { body: string; headers: Headers; until: number }
>();
const pending = new Map<string, Promise<Response>>();
const MAX_ENTRIES = 16;
let generation = 0;
let scope = "";
let installed = false;
let channel: BroadcastChannel | undefined;

export function clearNavigationCache(broadcast = false) {
  generation++;
  entries.clear();
  pending.clear();
  if (broadcast) channel?.postMessage(null);
}

function lifetime(path: string) {
  if (path === "/rules") return 300_000;
  if (path === "/system" || path.startsWith("/games/")) return 15_000;
  if (
    path === "/" ||
    path === "/you" ||
    path === "/groups" ||
    (path.startsWith("/groups/") && !path.startsWith("/groups/accept/"))
  )
    return 30_000;
  return 0;
}

function syncScope() {
  const next = `${page.data.cacheIdentity}:${document.cookie}`;
  if (next === scope) return;
  scope = next;
  clearNavigationCache();
}

function reusable(body: string) {
  try {
    const chunks = body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const first = chunks[0];
    return (
      first?.type === "data" &&
      first.nodes?.every(
        (node: { type: string } | null) => !node || node.type === "data",
      ) &&
      chunks.every((chunk) => !("error" in chunk))
    );
  } catch {
    return false;
  }
}

export function installNavigationCache() {
  if (installed) return;
  installed = true;
  const fetch = window.fetch.bind(window);
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("matchday-data-changed");
    channel.onmessage = () => clearNavigationCache();
  }
  document.addEventListener(
    "submit",
    (event) => {
      if (
        event.target instanceof HTMLFormElement &&
        event.target.method.toLowerCase() === "post"
      )
        clearNavigationCache(true);
    },
    true,
  );

  // Kit 3 deliberately uses window.fetch for route-data requests. Keep its
  // serialized response intact, including streamed promise chunks.
  window.fetch = async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.href,
    );
    if (url.origin !== location.origin) return fetch(input, init);
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      clearNavigationCache(true);
      try {
        return await fetch(input, init);
      } finally {
        clearNavigationCache(true);
      }
    }
    if (method !== "GET" || !url.pathname.endsWith("/__data.json"))
      return fetch(input, init);
    const path = url.pathname.slice(0, -"/__data.json".length) || "/";
    // Even static pages carry the signed-in account chip in their layout.
    const ttl = Math.min(
      lifetime(path),
      page.data.account?.signedIn ? 30_000 : Infinity,
    );
    if (!ttl) return fetch(input, init);
    syncScope();
    // Cache a complete layout + page, independent of the route we came from.
    // Replaying a partial ("skip") node could otherwise restore another page's data.
    const mask = url.searchParams.get("x-sveltekit-invalidated");
    if (!mask || !/^[01]+$/.test(mask)) return fetch(input, init);
    url.searchParams.delete("x-sveltekit-invalidated");
    const key = url.href;
    const hit = entries.get(key);
    if (hit && hit.until > Date.now()) {
      entries.delete(key);
      entries.set(key, hit);
      return new Response(hit.body, { headers: hit.headers });
    }
    entries.delete(key);
    const inFlight = pending.get(key);
    if (inFlight) return (await inFlight).clone();
    url.searchParams.set("x-sveltekit-invalidated", mask.replaceAll("0", "1"));
    const revision = generation;
    const request = (async () => {
      const response = await fetch(
        input instanceof Request ? new Request(url, input) : url,
        init,
      );
      if (!response.ok) return response;
      // A route enters once its panels are ready, not once per streamed chunk.
      const body = await response.text();
      if (
        revision === generation &&
        body.length < 1_000_000 &&
        reusable(body)
      ) {
        entries.set(key, {
          body,
          headers: response.headers,
          until: Date.now() + ttl,
        });
        while (entries.size > MAX_ENTRIES)
          entries.delete(entries.keys().next().value!);
      }
      return new Response(body, {
        status: response.status,
        headers: response.headers,
      });
    })();
    pending.set(key, request);
    try {
      return (await request).clone();
    } finally {
      if (pending.get(key) === request) pending.delete(key);
    }
  };
}

/** Prime the initial SSR page too, even if the user already navigated away. */
export function warmCurrentPage(href: string) {
  const url = new URL(href);
  if (!lifetime(url.pathname)) return;
  url.hash = "";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/__data.json`;
  // Groups and games have an extra implicit layout for their error boundary.
  // Kit ignores surplus flags on the simpler two-node routes.
  url.searchParams.set("x-sveltekit-invalidated", "111");
  void window.fetch(url).catch(() => {});
}
