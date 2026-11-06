/**
 * Installed once, after hydration. Not on the `/` first-load graph.
 */
import { installNavigationCache, warmCurrentPage } from "./navigation-cache";

let installed = false;

export function install() {
  if (installed) return;
  installed = true;
  installNavigationCache();
  const initialHref = location.href;
  window.setTimeout(() => warmCurrentPage(initialHref), 1000);

  window.addEventListener(
    "popstate",
    (event) => {
      (window as Window & { __mpUaVT?: boolean }).__mpUaVT =
        (event as PopStateEvent & { hasUAVisualTransition?: boolean })
          .hasUAVisualTransition === true;
    },
    { capture: true },
  );

  // One passive touchstart is enough for iOS to apply :active.
  document.addEventListener("touchstart", () => {}, { passive: true });
}
