// Live binding: the money scenario assigns globalThis.__MP_CF_ENV after the
// hook is registered and before it imports the data layer.
export const env = new Proxy(
  {},
  {
    get(_target, property) {
      const source = globalThis.__MP_CF_ENV;
      if (!source) return undefined;
      return source[property];
    },
  },
);

export function waitUntil(promise) {
  const pending = globalThis.__MP_WAIT_UNTIL;
  if (Array.isArray(pending)) pending.push(promise);
}
