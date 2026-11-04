/** `fetch` must be bound; calling an unbound reference throws in Workers. */
export function defaultFetch(): typeof fetch {
  return globalThis.fetch.bind(globalThis);
}

/**
 * Abort after `timeoutMs`, then always clear the timer so the isolate can finish
 * RPC responses (uncleared timers keep Workers alive until they fire).
 */
export async function fetchWithTimeout(
  fetcher: typeof fetch,
  resource: string | URL,
  init: Omit<RequestInit, "signal">,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const url = typeof resource === "string" ? resource : resource.toString();
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}
