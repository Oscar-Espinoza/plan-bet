/**
 * Reorder `<head>` so the inlined stylesheet is discovered first, and
 * drop font preloads. `/` keeps a short modulepreload list at low
 * priority. Dropping every modulepreload on `/` and the game page was
 * measured and did not lower simulated FCP.
 */
export function optimizePageHtml(html: string, pathname: string): string {
  const headMatch = html.match(/<head([^>]*)>([\s\S]*?)<\/head>/i);
  if (!headMatch) return html;

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

  let keptModulepreloads = modulepreloads;
  if (pathname === "/" || pathname === "") {
    keptModulepreloads = modulepreloads.filter(
      (l) =>
        /\/entry\/(start|app|payload)\./.test(l) ||
        /\/nodes\/0\./.test(l) ||
        /\/nodes\/4\./.test(l),
    );
    const chunkPreloads = modulepreloads.filter((l) => /\/chunks\//.test(l));
    if (chunkPreloads.length > 0) {
      keptModulepreloads.push(chunkPreloads[chunkPreloads.length - 1]!);
    }
  }

  // Fonts use font-display: swap, so a preload only competes with first
  // paint. The disabled stylesheet link stays: Vite treats it as already
  // loaded and does not inject a second, blocking request. This Chrome
  // does not download a disabled stylesheet.
  const ordered = [
    withoutLinks.trim(),
    ...stylesheets,
    ...imagePreloads,
    ...miscPreloads,
    ...otherLinks,
    ...keptModulepreloads.map(deprioritize),
  ]
    .filter(Boolean)
    .join("\n\t\t");

  return html.replace(
    headMatch[0],
    `<head${attrs}>\n\t\t${ordered}\n\t</head>`,
  );
}

function deprioritize(tag: string): string {
  if (/fetchpriority="/i.test(tag)) {
    return tag.replace(/fetchpriority="[^"]*"/i, 'fetchpriority="low"');
  }
  return tag.replace(/<link\b/i, '<link fetchpriority="low"');
}
