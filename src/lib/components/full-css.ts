/** Resolves once the post-paint stylesheet has been applied. */
export function fullCssReady(): Promise<void> {
  if (typeof globalThis === "undefined") return Promise.resolve();
  const ready = (globalThis as { __mpFullCss?: Promise<void> }).__mpFullCss;
  return ready ?? Promise.resolve();
}
