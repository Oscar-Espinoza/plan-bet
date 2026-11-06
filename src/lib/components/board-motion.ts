import { tick } from "svelte";
import { EASE, reducedMotion } from "./motion";

type Frame = {
  node: HTMLElement;
  rect: DOMRect;
  content: string;
};

/** Keep the board's surfaces in place; only changed fields and rows move. */
export function boardMotion(root: () => HTMLElement) {
  let version = 0;
  let animations: Animation[] = [];
  let ghosts: HTMLElement[] = [];
  let restore: (() => void) | undefined;

  function cancel() {
    version++;
    for (const animation of animations) animation.cancel();
    animations = [];
    for (const ghost of ghosts) ghost.remove();
    ghosts = [];
    restore?.();
    restore = undefined;
  }

  function frames(board: HTMLElement) {
    const result = new Map<string, Frame>();
    const add = (key: string, node: HTMLElement) => {
      if (node.closest("[data-board-ghost]")) return;
      result.set(key, {
        node,
        rect: node.getBoundingClientRect(),
        // Includes the image source, but excludes animation state on the node.
        content: node.innerHTML,
      });
    };
    for (const node of board.querySelectorAll<HTMLElement>(".game-row")) {
      add(`row:${node.getAttribute("href")}`, node);
    }
    for (const node of board.querySelectorAll<HTMLElement>(
      ".panel-header,.live-section > .section-heading",
    )) {
      add(
        `heading:${node.parentElement?.getAttribute("aria-labelledby")}`,
        node,
      );
    }
    for (const selector of [
      ".next-up-team",
      ".next-up-header > :not(.next-up-eyebrow)",
      ".next-up-detail > *",
      ".slate-filters",
      ".slate-freshness-standalone",
      ".slate-empty",
      ".slate-hero",
    ]) {
      board.querySelectorAll<HTMLElement>(selector).forEach((node, index) => {
        add(`${selector}:${index}`, node);
      });
    }
    return result;
  }

  async function run(update: () => void) {
    const board = root();
    // Capture the current animated positions before cancelling a quick prior tap.
    const before = frames(board);
    cancel();
    const current = version;
    const reduced = reducedMotion();
    const scroll = board.closest<HTMLElement>(".workspace-scroll");
    const position = board.style.position;
    const anchor = scroll?.style.overflowAnchor ?? "";
    board.style.position = "relative";
    if (scroll) scroll.style.overflowAnchor = "none";
    restore = () => {
      board.style.position = position;
      if (scroll) scroll.style.overflowAnchor = anchor;
    };

    update();
    await tick();
    if (current !== version) return;
    const after = frames(board);
    const bounds = board.getBoundingClientRect();
    const viewport = scroll?.getBoundingClientRect();
    const duration = reduced ? 120 : 240;
    const animate = (
      node: HTMLElement,
      keyframes: Keyframe[],
      ms = duration,
    ) => {
      const animation = node.animate(keyframes, { duration: ms, easing: EASE });
      animations.push(animation);
      return animation;
    };

    for (const [key, previous] of before) {
      if (!key.startsWith("row:") || after.has(key)) continue;
      if (
        viewport &&
        (previous.rect.bottom < viewport.top ||
          previous.rect.top > viewport.bottom)
      )
        continue;
      const ghost = previous.node.cloneNode(true) as HTMLElement;
      ghost.dataset.boardGhost = "";
      ghost.inert = true;
      ghost.setAttribute("aria-hidden", "true");
      ghost.removeAttribute("id");
      for (const node of ghost.querySelectorAll("[id]"))
        node.removeAttribute("id");
      Object.assign(ghost.style, {
        position: "absolute",
        top: `${previous.rect.top - bounds.top}px`,
        left: `${previous.rect.left - bounds.left}px`,
        width: `${previous.rect.width}px`,
        height: `${previous.rect.height}px`,
        margin: "0",
        pointerEvents: "none",
        zIndex: "1",
      });
      board.append(ghost);
      ghosts.push(ghost);
      const exit = animate(ghost, [{ opacity: 1 }, { opacity: 0 }], 100);
      void exit.finished.catch(() => {}).then(() => ghost.remove());
    }

    for (const [key, frame] of after) {
      const previous = before.get(key);
      const isField = key.startsWith(".next-up");
      const changed = previous?.content !== frame.content;
      const dx = previous ? previous.rect.left - frame.rect.left : 0;
      const dy = previous ? previous.rect.top - frame.rect.top : 0;
      const move =
        !reduced && previous && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5);
      // Shared match rows remain fully opaque. Unchanged hero information does
      // nothing at all, including All → Soccer when the same fixture leads.
      const settle = !previous || (isField && changed);
      if (!move && !settle) continue;
      animate(frame.node, [
        {
          ...(settle ? { opacity: 0.45 } : {}),
          ...(!reduced
            ? { transform: `translate(${dx}px, ${previous ? dy : 6}px)` }
            : {}),
        },
        {
          ...(settle ? { opacity: 1 } : {}),
          ...(!reduced ? { transform: "none" } : {}),
        },
      ]);
    }

    await Promise.all(
      animations.map((animation) => animation.finished.catch(() => {})),
    );
    if (current === version) cancel();
  }

  return { run, cancel };
}
