/**
 * Reorder `<head>` so the inlined stylesheet is discovered first, drop
 * font preloads and every modulepreload, and hold `kit.start` until after
 * the first frame. A double animation frame still started the import in
 * the same timestamp as first paint, so the wait is one frame and then a
 * macrotask. Modulepreloads and an immediate `import()` both pull
 * the client chunks into the first-paint window.
 */
export function optimizePageHtml(html: string, pathname: string): string {
  const delayed = delayKitStart(html);
  const headMatch = delayed.match(/<head([^>]*)>([\s\S]*?)<\/head>/i);
  if (!headMatch) return delayed;

  const [, attrs, content] = headMatch;
  const links: string[] = [];
  const withoutLinks = content.replace(/<link\s[^>]*>/gi, (tag) => {
    links.push(tag);
    return "\n";
  });

  const stylesheets = links.filter((l) => /rel="stylesheet"/i.test(l));
  const modulepreloads = links.filter((l) => /rel="modulepreload"/i.test(l));
  const preloads = links.filter(
    (l) => /rel="preload"/i.test(l) && !/rel="modulepreload"/i.test(l),
  );
  const otherLinks = links.filter(
    (l) =>
      !stylesheets.includes(l) &&
      !modulepreloads.includes(l) &&
      !preloads.includes(l),
  );

  const fontPreloads = preloads.filter((l) => /as="font"/i.test(l));
  const imagePreloads = preloads.filter((l) => /as="image"/i.test(l));
  const miscPreloads = preloads.filter(
    (l) => !fontPreloads.includes(l) && !imagePreloads.includes(l),
  );

  // Fonts use font-display: swap, so a preload only competes with first
  // paint. The disabled stylesheet link stays: Vite treats it as already
  // loaded and does not inject a second, blocking request. This Chrome
  // does not download a disabled stylesheet. Modulepreloads are dropped
  // on every HTML page; the entry script loads its imports after paint.
  void pathname;
  const ordered = [
    withoutLinks.trim(),
    ...stylesheets,
    ...imagePreloads,
    ...miscPreloads,
    ...otherLinks,
  ]
    .filter(Boolean)
    .join("\n\t\t");

  return delayed.replace(
    headMatch[0],
    `<head${attrs}>\n\t\t${ordered}\n\t</head>`,
  );
}

/**
 * `document.currentScript` is only set while this inline script runs, so
 * `element` is captured immediately. The dynamic import waits until after
 * the first paint (one frame, then a macrotask) so those chunks are not in
 * the first-paint window.
 * The service-worker block stays outside the wait: it registers on `load`.
 */
function delayKitStart(html: string): string {
  const start =
    /import\((["'])(\.\/_app\/immutable\/entry\/start\.[^"']+)\1\)\.then\(async \(kit\) => \{/;
  if (!start.test(html)) return html;
  const opened = html.replace(
    start,
    "requestAnimationFrame(() => {\n\t\t\t\t\tsetTimeout(() => {\n\t\t\t\t\t\timport($1$2$1).then(async (kit) => {",
  );
  const closed = opened.replace(
    /\}\);\n(\s*)if \('serviceWorker' in navigator\)/,
    "});\n$1}, 0);\n$1});\n\n$1if ('serviceWorker' in navigator)",
  );
  return closed === opened ? html : closed;
}
