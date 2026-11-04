/**
 * Reorder `<head>` so the inlined stylesheet is discovered first, drop
 * font preloads and every modulepreload, and hold `kit.start` until after
 * the first frame. A double animation frame still started the import in
 * the same timestamp as first paint, so the wait is one frame and then a
 * macrotask. Modulepreloads and an immediate `import()` both pull
 * the client chunks into the first-paint window. `fonts` on `<html>` is
 * what switches the used stacks onto the woff2 faces. That class waits
 * until a first-contentful-paint entry exists: the macrotask, and one
 * frame after it, both still started the woff2 requests a few milliseconds
 * before first paint. `document.fonts.check()` adds the class immediately
 * when the faces are already loaded in this document; a check on its own
 * does not request them.
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
 * True only when this document has already loaded the three families.
 * A warm HTTP cache is not enough: a new document still reports false,
 * and the check does not start a request. Both DM Mono files are separate
 * faces, so each weight is checked.
 */
const FONTS_IF_READY = `try{if(document.fonts.check('600 16px "archivo"')&&document.fonts.check('400 16px "plexSans"')&&document.fonts.check('400 16px "dmMono"')&&document.fonts.check('500 16px "dmMono"'))document.documentElement.classList.add("fonts")}catch(e){}\n\t\t\t\t\t`;

/** Adds `fonts` on the frame after first contentful paint, or after 90 frames. */
const ARM_FONTS = `(() => { if (document.documentElement.classList.contains("fonts")) return; let frames = 0; const arm = () => { frames += 1; if (frames > 90 || performance.getEntriesByType("paint").some((entry) => entry.name === "first-contentful-paint")) document.documentElement.classList.add("fonts"); else requestAnimationFrame(arm); }; arm(); })();\n\t\t\t\t\t\t`;

/**
 * `document.currentScript` is only set while this inline script runs, so
 * `element` is captured immediately. The dynamic import waits until after
 * the first paint (one frame, then a macrotask) so those chunks are not in
 * the first-paint window. Nested routes import `../_app/...` rather than
 * `./_app/...`. The service-worker block stays outside the wait: it
 * registers on `load`.
 */
function delayKitStart(html: string): string {
  const start =
    /import\((["'])((?:\.+\/)+_app\/immutable\/entry\/start\.[^"']+)\1\)\.then\(async \(kit\) => \{/;
  if (!start.test(html)) return html;
  const opened = html.replace(
    start,
    `${FONTS_IF_READY}requestAnimationFrame(() => {\n\t\t\t\t\tsetTimeout(() => {\n\t\t\t\t\t\t${ARM_FONTS}import($1$2$1).then(async (kit) => {`,
  );
  const closed = opened.replace(
    /\}\);\n(\s*)if \('serviceWorker' in navigator\)/,
    "});\n$1}, 0);\n$1});\n\n$1if ('serviceWorker' in navigator)",
  );
  return closed === opened ? html : closed;
}
