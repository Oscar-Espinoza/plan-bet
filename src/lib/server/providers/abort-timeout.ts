/** `fetch` must be bound; calling an unbound reference throws in Workers. */
export function defaultFetch(): typeof fetch {
  return globalThis.fetch.bind(globalThis);
}

/** Workers compatibility: `AbortSignal.timeout` is not always available. */
export function abortSignalTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
