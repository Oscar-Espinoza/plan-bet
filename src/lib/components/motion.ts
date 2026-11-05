/**
 * Mirrors the motion tokens on :root in src/app.css.
 * Modules that `/` imports statically must not import this module.
 */
import { tick } from "svelte";

export const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

export const DURATION = {
  fast: 120,
  swap: 150,
  enter: 200,
  expand: 240,
  sheet: 280,
} as const;

export function reducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function fade(
  nodes: Element | Iterable<Element> | null | undefined,
  from: number,
  ms = DURATION.swap,
): void {
  if (nodes == null) return;
  const list = nodes instanceof Element ? [nodes] : nodes;
  const duration = reducedMotion() ? Math.min(ms, 120) : ms;
  for (const node of list) {
    for (const animation of node.getAnimations()) {
      if (animation.id === "mp-fade") animation.cancel();
    }
    node.animate([{ opacity: from }, { opacity: 1 }], {
      id: "mp-fade",
      duration,
      easing: EASE,
    });
  }
}

export function afterExit(ms: number, done: () => void): () => void {
  const t = setTimeout(done, reducedMotion() ? 120 : ms);
  return () => clearTimeout(t);
}

export function arrive(
  nodes: Element | Iterable<Element> | null | undefined,
  since: number,
  from = 0,
): void {
  if (performance.now() - since >= 50) fade(nodes, from);
}

export async function fadeAdded(
  root: Element | null | undefined,
  update: () => unknown,
  selector: string,
): Promise<void> {
  const before = new Set(root ? root.querySelectorAll(selector) : []);
  await update();
  await tick();
  if (!root) return;
  const added: Element[] = [];
  for (const node of root.querySelectorAll(selector)) {
    if (!before.has(node)) added.push(node);
  }
  const outermost = added.filter(
    (node) => !added.some((other) => other !== node && other.contains(node)),
  );
  fade(outermost, 0);
}
