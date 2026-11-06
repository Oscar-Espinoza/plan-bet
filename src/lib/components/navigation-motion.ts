import { tick } from "svelte";
import type { OnNavigate } from "$app/navigation";
import { fullCssReady } from "./full-css";

export async function navigate(navigation: OnNavigate): Promise<void> {
  const w = window as Window & { __mpUaVT?: boolean };
  const nativeBack = navigation.type === "popstate" && w.__mpUaVT === true;
  w.__mpUaVT = false;
  await fullCssReady();
  // Query filters and background refreshes update the existing page in place.
  if (navigation.from?.url.pathname === navigation.to?.url.pathname) return;
  return new Promise<void>((resolve) => {
    void changeView(async () => {
      resolve();
      await navigation.complete;
    }, nativeBack).catch(() => resolve());
  });
}

let animation: Animation | undefined;
let revision = 0;
const ease = "cubic-bezier(0.23, 1, 0.32, 1)";

/** One owner for each route change, including interrupted navigation.
 * Loaded on interaction, never on the first-load graph.
 */
export async function changeView(
  update: () => void | Promise<void>,
  nativeBack = false,
): Promise<void> {
  const current = ++revision;
  const outgoing = document.querySelector(".workspace-scroll");
  const from = outgoing ? getComputedStyle(outgoing) : null;
  const opacity = from?.opacity ?? "1";
  const transform = from?.transform ?? "none";
  animation?.cancel();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (nativeBack || document.hidden) {
    await update();
    return;
  }
  // Animate the real content, leaving header/navigation live and clickable.
  // Snapshot transitions make captured chrome inert during rapid second taps.
  // Reduced motion keeps only a short fade; resting styles stay visible.
  if (outgoing) {
    animation = outgoing.animate(
      [
        { opacity, transform: reduced ? "none" : transform },
        { opacity: 0, transform: reduced ? "none" : "translateY(-8px)" },
      ],
      { duration: reduced ? 90 : 110, easing: ease, fill: "forwards" },
    );
    await animation.finished.catch(() => {});
  }
  // Even a cancelled animation must release the router's navigation hook.
  await update();
  await tick();
  if (current !== revision) return;
  animation?.cancel();
  const incoming = document.querySelector(".workspace-scroll");
  animation = incoming?.animate(
    [
      { opacity: 0, transform: reduced ? "none" : "translateY(12px)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: reduced ? 120 : 220, easing: ease },
  );
}
