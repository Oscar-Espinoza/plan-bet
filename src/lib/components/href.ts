/**
 * SvelteKit's `resolve()` only types routes that exist in this build.
 * The shell also links to pages later tickets add, so callers pass the
 * pathname through here before `resolve()`.
 */
export function asRoute(href: string): "/" {
  return href as "/";
}
