import { tick } from "svelte";
import { EASE, reducedMotion } from "./motion";

/** Visual swaps only: selection and request state remain owned by the caller. */
export function contentSwap(
  nodes: () => HTMLElement[],
  resize?: () => { container: HTMLElement; content: HTMLElement } | null,
) {
  let version = 0;
  let animations: Animation[] = [];
  let releaseSize: (() => void) | undefined;

  function cancel() {
    version++;
    for (const animation of animations) animation.cancel();
    animations = [];
    releaseSize?.();
    releaseSize = undefined;
  }

  async function run(update: () => void, animate = true) {
    // Read the live frame before cancelling, so a quick second selection
    // continues from the current position rather than jumping to the start.
    const outgoing = nodes().map((node) => {
      const style = getComputedStyle(node);
      return { node, opacity: style.opacity, transform: style.transform };
    });
    const reduced = reducedMotion();
    const region = animate && !reduced ? resize?.() : null;
    const height = region?.container.getBoundingClientRect().height ?? 0;
    cancel();
    const current = version;
    if (!animate || !outgoing.length) {
      update();
      return;
    }
    if (region) {
      // Keep layout at its current frame while the old content leaves. The
      // inner content remains naturally sized, even when the next tab is shorter.
      const { container } = region;
      const workspace = container.closest<HTMLElement>(".workspace-scroll");
      const scroller =
        workspace && getComputedStyle(workspace).overflowY !== "visible"
          ? workspace
          : document.documentElement;
      const previous = {
        height: container.style.height,
        overflow: container.style.overflow,
        anchor: scroller.style.overflowAnchor,
      };
      container.style.height = `${height}px`;
      container.style.overflow = "clip";
      scroller.style.overflowAnchor = "none";
      releaseSize = () => {
        container.style.height = previous.height;
        container.style.overflow = previous.overflow;
        scroller.style.overflowAnchor = previous.anchor;
      };
    }
    animations = outgoing.map(({ node, opacity, transform }) =>
      node.animate(
        [
          { opacity, ...(reduced ? {} : { transform }) },
          { opacity: 0, ...(reduced ? {} : { transform: "translateY(-6px)" }) },
        ],
        {
          duration: reduced ? 90 : 110,
          easing: EASE,
          fill: "forwards",
        },
      ),
    );
    await Promise.all(
      animations.map((animation) => animation.finished.catch(() => {})),
    );
    if (current !== version) return;
    update();
    await tick();
    if (current !== version) return;
    const nextHeight = region?.content.getBoundingClientRect().height ?? 0;
    for (const animation of animations) animation.cancel();
    animations = nodes().map((node) =>
      node.animate(
        [
          { opacity: 0, ...(reduced ? {} : { transform: "translateY(8px)" }) },
          { opacity: 1, ...(reduced ? {} : { transform: "none" }) },
        ],
        { duration: reduced ? 120 : 220, easing: EASE },
      ),
    );
    if (region && Math.abs(nextHeight - height) > 0.5) {
      animations.push(
        region.container.animate(
          [{ height: `${height}px` }, { height: `${nextHeight}px` }],
          { duration: 220, easing: EASE, fill: "forwards" },
        ),
      );
    }
    await Promise.all(
      animations.map((animation) => animation.finished.catch(() => {})),
    );
    if (current === version) cancel();
  }

  return { run, cancel };
}
