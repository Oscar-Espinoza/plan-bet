/**
 * Installed once, after hydration. Not on the `/` first-load graph.
 */
let installed = false;
let previewWarm: Promise<unknown> | null = null;

function warmPreview(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest("a[href]")) return;
  previewWarm ??= import("./navigation-preview.svelte");
}

export function install() {
  if (installed) return;
  installed = true;

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

  document.addEventListener("pointerdown", warmPreview, {
    capture: true,
    passive: true,
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    warmPreview(event);
  });
}
