/**
 * Prunes an inlined Tailwind/Lightning CSS stylesheet down to rules that
 * can match the rendered document. The index is built once per stylesheet
 * text (route depth rewrites font URLs, so home and a game page differ).
 * Matching is set lookups. A rule is kept when its selector is not understood.
 */

const STATE_PSEUDOS = new Set([
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
  "visited",
  "link",
  "any-link",
  "target",
  "checked",
  "disabled",
  "enabled",
  "required",
  "optional",
  "read-only",
  "read-write",
  "placeholder-shown",
  "default",
  "indeterminate",
  "valid",
  "invalid",
  "in-range",
  "out-of-range",
  "user-invalid",
  "user-valid",
  "fullscreen",
  "modal",
  "open",
  "closed",
  "defined",
  "root",
  "host",
  "scope",
  "first-child",
  "last-child",
  "only-child",
  "first-of-type",
  "last-of-type",
  "only-of-type",
  "empty",
  "playing",
  "paused",
  "seeking",
  "buffering",
  "muted",
  "volume-locked",
  "popover-open",
  "autofill",
  "placeholder",
  "dir",
  "lang",
  "nth-child",
  "nth-last-child",
  "nth-of-type",
  "nth-last-of-type",
  "not",
  "has",
  "is",
  "where",
  "-webkit-any",
  "before",
  "after",
]);

const STATE_ATTRS = new Set([
  "open",
  "hidden",
  "disabled",
  "checked",
  "inert",
  "popover",
  "selected",
  "multiple",
]);

const STATE_SUFFIXES = ["-active", "-open", "-selected", "-current"];

/** Mounted after first paint on the shell, before the full sheet can be assumed. */
const ALWAYS_PRESENT = [
  "navigation-preview",
  "tour-bar",
  "tour-bar-copy",
  "tour-bar-count",
  "button-secondary",
  "button-sm",
  "button-ghost",
  "button-danger",
  "button-icon",
];

/**
 * The open bet slip is not in the server HTML until a price is armed.
 * Keep its rules when the panel itself is on the page.
 */
const WHEN_WAGER_PANEL = [
  "bet-bar",
  "bet-bar-pick",
  "bet-bar-stake",
  "bet-bar-returns",
  "bet-bar-place",
  "bet-confirmation",
  "bet-group",
  "bet-balance",
  "bet-hint",
  "bet-ticket-icon",
  "stake-chips",
  "selection-button",
  "selection-button-active",
  "selection-grid",
  "selection-market",
  "selection-row",
  "market-filters",
  "side-form",
  "enter",
  "enter-pop",
  "wager-feedback",
  "return-figure",
  "w-full",
  "banner",
  "banner-positive",
  "banner-negative",
  "banner-warning",
  "banner-neutral",
  "field",
];

type Profile = {
  classes: Set<string>;
  tags: Set<string>;
  ids: Set<string>;
  attrs: Set<string>;
};

type Pred = (doc: Profile) => boolean;

type Node =
  | { kind: "text"; text: string }
  | { kind: "group"; prefix: string; children: Node[] }
  | { kind: "rule"; parts: { text: string; pred: Pred }[]; body: string };

type Sheet = {
  nodes: Node[];
  keyframes: { name: string; text: string }[];
};

const TRUE: Pred = () => true;

const indexCache = new Map<string, Sheet>();

export function pruneCriticalCss(
  css: string,
  html: string,
): { css: string; ms: number } {
  const perfStart = performance.now();
  const wallStart = Date.now();
  const finish = (value: string) => ({
    css: value,
    // performance.now() on the Workers runtime can stay put through a
    // synchronous turn. Date.now() is the other clock. Report whichever moved.
    ms: Math.max(performance.now() - perfStart, Date.now() - wallStart),
  });
  try {
    const sheet = stylesheetIndex(css);
    const doc = profileDocument(html);
    const pruned = applySheet(sheet, doc);
    if (pruned.length < css.length * 0.05) return finish(css);
    return finish(pruned);
  } catch {
    return finish(css);
  }
}

function stylesheetIndex(css: string): Sheet {
  const hit = indexCache.get(css);
  if (hit) return hit;
  const keyframes: Sheet["keyframes"] = [];
  const nodes = parseSheet(css, keyframes);
  const sheet = { nodes, keyframes };
  indexCache.set(css, sheet);
  if (indexCache.size > 4) {
    const first = indexCache.keys().next().value;
    if (first !== undefined) indexCache.delete(first);
  }
  return sheet;
}

function applySheet(sheet: Sheet, doc: Profile): string {
  const out: string[] = [];
  emitNodes(sheet.nodes, doc, out);
  const css = out.join("");
  let frames = "";
  for (const frame of sheet.keyframes) {
    if (!frame.name) continue;
    const pattern = new RegExp(
      `(?<![\\w-])${escapeRegExp(frame.name)}(?![\\w-])`,
    );
    if (pattern.test(css)) frames += frame.text;
  }
  return css + frames;
}

function emitNodes(nodes: Node[], doc: Profile, out: string[]): void {
  for (const node of nodes) {
    if (node.kind === "text") {
      out.push(node.text);
      continue;
    }
    if (node.kind === "group") {
      const inner: string[] = [];
      emitNodes(node.children, doc, inner);
      const css = inner.join("");
      if (css) out.push(`${node.prefix}{${css}}`);
      continue;
    }
    const selectors: string[] = [];
    for (const part of node.parts) {
      if (part.pred(doc)) selectors.push(part.text);
    }
    if (selectors.length > 0) {
      out.push(`${selectors.join(",")}{${node.body}}`);
    }
  }
}

function profileDocument(html: string): Profile {
  const withoutScripts = html.replace(
    /<script\b[^>]*>[\s\S]*?<\/script>/gi,
    " ",
  );
  const cleaned = withoutScripts.replace(
    /<style\b[^>]*>[\s\S]*?<\/style>/gi,
    " ",
  );
  const classes = new Set<string>();
  const tags = new Set<string>(["html", "body", "head"]);
  const ids = new Set<string>();
  const attrs = new Set<string>();
  const element = /<([a-zA-Z][\w:-]*)([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = element.exec(cleaned))) {
    tags.add(match[1].toLowerCase());
    readAttributes(match[2], classes, ids, attrs);
  }
  for (const name of ALWAYS_PRESENT) classes.add(name);
  if (classes.has("wager-panel")) {
    for (const name of WHEN_WAGER_PANEL) classes.add(name);
  }
  return { classes, tags, ids, attrs };
}

function readAttributes(
  source: string,
  classes: Set<string>,
  ids: Set<string>,
  attrs: Set<string>,
): void {
  const valued = /([:@\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = valued.exec(source))) {
    const name = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    if (name === "class") {
      for (const token of value.split(/\s+/)) {
        if (token) classes.add(token);
      }
      continue;
    }
    if (name === "id") {
      ids.add(value);
      attrs.add("id");
      attrs.add(`id=${value}`);
      continue;
    }
    attrs.add(name);
    attrs.add(`${name}=${value}`);
  }
}

function parseSheet(css: string, keyframes: Sheet["keyframes"]): Node[] {
  const nodes: Node[] = [];
  let index = 0;
  while (index < css.length) {
    while (index < css.length && isSpace(css[index])) index += 1;
    if (index >= css.length) break;
    if (css.startsWith("/*", index)) {
      const end = css.indexOf("*/", index + 2);
      if (end < 0) {
        nodes.push({ kind: "text", text: css.slice(index) });
        break;
      }
      nodes.push({ kind: "text", text: css.slice(index, end + 2) });
      index = end + 2;
      continue;
    }
    const start = index;
    let paren = 0;
    while (index < css.length) {
      const char = css[index];
      if (char === '"' || char === "'") {
        index = skipString(css, index);
        continue;
      }
      if (char === "(") paren += 1;
      else if (char === ")") paren -= 1;
      else if (char === "{" && paren === 0) break;
      else if (char === ";" && paren === 0) break;
      index += 1;
    }
    const prelude = css.slice(start, index).trim();
    if (index < css.length && css[index] === ";") {
      if (prelude.startsWith("@") || prelude.startsWith("/*")) {
        nodes.push({
          kind: "text",
          text: prelude.endsWith(";") ? prelude : `${prelude};`,
        });
      }
      index += 1;
      continue;
    }
    if (index >= css.length || css[index] !== "{") {
      if (prelude) nodes.push({ kind: "text", text: prelude });
      break;
    }
    index += 1;
    const bodyStart = index;
    let depth = 1;
    while (index < css.length && depth > 0) {
      const char = css[index];
      if (char === '"' || char === "'") {
        index = skipString(css, index);
        continue;
      }
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      index += 1;
    }
    const body = css.slice(bodyStart, index - 1);
    pushBlock(prelude, body, nodes, keyframes);
  }
  return nodes;
}

function pushBlock(
  prelude: string,
  body: string,
  nodes: Node[],
  keyframes: Sheet["keyframes"],
): void {
  const lower = prelude.toLowerCase();
  if (
    lower.startsWith("@font-face") ||
    lower.startsWith("@property") ||
    lower.startsWith("@layer properties") ||
    lower.startsWith("@layer theme")
  ) {
    nodes.push({ kind: "text", text: `${prelude}{${body}}` });
    return;
  }
  if (
    lower.startsWith("@keyframes") ||
    lower.startsWith("@-webkit-keyframes")
  ) {
    const name = prelude.split(/\s+/)[1] ?? "";
    keyframes.push({ name, text: `${prelude}{${body}}` });
    return;
  }
  if (lower.startsWith("@")) {
    nodes.push({
      kind: "group",
      prefix: prelude,
      children: parseSheet(body, keyframes),
    });
    return;
  }
  const parts = splitCommas(prelude).map((selector) => ({
    text: selector,
    pred: compileComplex(selector),
  }));
  nodes.push({ kind: "rule", parts, body });
}

function compileComplex(selector: string): Pred {
  try {
    const compounds = splitCompounds(selector);
    if (compounds.length === 0) return TRUE;
    const preds = compounds.map((compound) => compileCompound(compound));
    return (doc) => preds.every((pred) => pred(doc));
  } catch {
    return TRUE;
  }
}

function compileCompound(compound: string): Pred {
  const tags: string[] = [];
  const classes: string[] = [];
  const ids: string[] = [];
  const attrs: { name: string; value: string | null }[] = [];
  const ors: Pred[] = [];
  let unsure = false;
  let index = 0;
  while (index < compound.length) {
    const char = compound[index];
    if (isSpace(char)) {
      index += 1;
      continue;
    }
    if (char === ".") {
      const ident = readIdent(compound, index + 1);
      classes.push(unescapeIdent(ident.value));
      index = ident.next;
      continue;
    }
    if (char === "#") {
      const ident = readIdent(compound, index + 1);
      ids.push(unescapeIdent(ident.value));
      index = ident.next;
      continue;
    }
    if (char === "[") {
      const read = readAttribute(compound, index);
      attrs.push(read.attr);
      index = read.next;
      continue;
    }
    if (char === ":") {
      if (compound.startsWith("::", index)) {
        const ident = readIdent(compound, index + 2);
        index = ident.next;
        if (compound[index] === "(") index = skipGroup(compound, index);
        continue;
      }
      const ident = readIdent(compound, index + 1);
      const name = ident.value.toLowerCase();
      index = ident.next;
      if (compound[index] === "(") {
        const argStart = index;
        index = skipGroup(compound, index);
        const arg = compound.slice(argStart + 1, index - 1);
        if (name === "is" || name === "where" || name === "-webkit-any") {
          const alternatives = splitCommas(arg).map((item) =>
            compileComplex(item),
          );
          ors.push((doc) => alternatives.some((pred) => pred(doc)));
        } else if (
          name !== "not" &&
          name !== "has" &&
          !STATE_PSEUDOS.has(name)
        ) {
          unsure = true;
        }
        continue;
      }
      if (!STATE_PSEUDOS.has(name)) unsure = true;
      continue;
    }
    if (char === "*") {
      index += 1;
      continue;
    }
    if (isIdentStart(char)) {
      const ident = readIdent(compound, index);
      tags.push(unescapeIdent(ident.value).toLowerCase());
      index = ident.next;
      continue;
    }
    unsure = true;
    index += 1;
  }
  if (unsure) return TRUE;
  return (doc) => {
    for (const tag of tags) {
      if (!doc.tags.has(tag)) return false;
    }
    for (const id of ids) {
      if (!doc.ids.has(id)) return false;
    }
    for (const name of classes) {
      if (!classPresent(name, doc)) return false;
    }
    for (const attr of attrs) {
      if (!attrPresent(attr.name, attr.value, doc)) return false;
    }
    for (const or of ors) {
      if (!or(doc)) return false;
    }
    return true;
  };
}

function classPresent(name: string, doc: Profile): boolean {
  if (doc.classes.has(name)) return true;
  if (name === "fonts" || name.startsWith("is-")) return true;
  for (const suffix of STATE_SUFFIXES) {
    if (
      name.endsWith(suffix) &&
      doc.classes.has(name.slice(0, -suffix.length))
    ) {
      return true;
    }
  }
  return false;
}

function attrPresent(
  name: string,
  value: string | null,
  doc: Profile,
): boolean {
  const lower = name.toLowerCase();
  if (
    lower.startsWith("aria-") ||
    lower.startsWith("data-") ||
    STATE_ATTRS.has(lower)
  ) {
    return true;
  }
  if (value === null) return doc.attrs.has(lower);
  return doc.attrs.has(`${lower}=${value}`);
}

function readAttribute(
  source: string,
  index: number,
): { attr: { name: string; value: string | null }; next: number } {
  let cursor = index + 1;
  const ident = readIdent(source, cursor);
  cursor = ident.next;
  let value: string | null = null;
  while (cursor < source.length && isSpace(source[cursor])) cursor += 1;
  if (cursor < source.length && "~|^$*".includes(source[cursor])) {
    if ("~|^$*".includes(source[cursor]) && source[cursor + 1] === "=") {
      cursor += 2;
    } else {
      cursor += 1;
    }
    value = readAttrValue(source, cursor).value;
    cursor = readAttrValue(source, cursor).next;
  } else if (source[cursor] === "=") {
    cursor += 1;
    const read = readAttrValue(source, cursor);
    value = read.value;
    cursor = read.next;
  }
  while (cursor < source.length && source[cursor] !== "]") cursor += 1;
  return {
    attr: { name: ident.value, value },
    next: cursor < source.length ? cursor + 1 : cursor,
  };
}

function readAttrValue(
  source: string,
  index: number,
): { value: string; next: number } {
  let cursor = index;
  while (cursor < source.length && isSpace(source[cursor])) cursor += 1;
  if (source[cursor] === '"' || source[cursor] === "'") {
    const end = skipString(source, cursor);
    return { value: source.slice(cursor + 1, end - 1), next: end };
  }
  const start = cursor;
  while (
    cursor < source.length &&
    source[cursor] !== " " &&
    source[cursor] !== "]"
  ) {
    cursor += 1;
  }
  return { value: source.slice(start, cursor), next: cursor };
}

function splitCommas(source: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let depth = 0;
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '"' || char === "'") {
      const end = skipString(source, index);
      buf += source.slice(index, end);
      index = end;
      continue;
    }
    if (char === "(" || char === "[") depth += 1;
    else if ((char === ")" || char === "]") && depth > 0) depth -= 1;
    else if (char === "," && depth === 0) {
      const item = buf.trim();
      if (item) parts.push(item);
      buf = "";
      index += 1;
      continue;
    }
    buf += char;
    index += 1;
  }
  const tail = buf.trim();
  if (tail) parts.push(tail);
  return parts;
}

function splitCompounds(selector: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let depth = 0;
  let index = 0;
  while (index < selector.length) {
    const char = selector[index];
    if (char === '"' || char === "'") {
      const end = skipString(selector, index);
      buf += selector.slice(index, end);
      index = end;
      continue;
    }
    if (char === "(" || char === "[") {
      depth += 1;
      buf += char;
      index += 1;
      continue;
    }
    if ((char === ")" || char === "]") && depth > 0) {
      depth -= 1;
      buf += char;
      index += 1;
      continue;
    }
    if (depth === 0 && (char === ">" || char === "+" || char === "~")) {
      const item = buf.trim();
      if (item) parts.push(item);
      buf = "";
      index += 1;
      continue;
    }
    if (depth === 0 && isSpace(char)) {
      const item = buf.trim();
      if (item) parts.push(item);
      buf = "";
      index += 1;
      continue;
    }
    buf += char;
    index += 1;
  }
  const tail = buf.trim();
  if (tail) parts.push(tail);
  return parts;
}

function readIdent(
  source: string,
  index: number,
): { value: string; next: number } {
  const start = index;
  let cursor = index;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === "\\") {
      cursor += 2;
      continue;
    }
    if (isIdentChar(char)) {
      cursor += 1;
      continue;
    }
    break;
  }
  return { value: source.slice(start, cursor), next: cursor };
}

function unescapeIdent(value: string): string {
  let out = "";
  let index = 0;
  while (index < value.length) {
    if (value[index] === "\\" && index + 1 < value.length) {
      out += value[index + 1];
      index += 2;
      continue;
    }
    out += value[index];
    index += 1;
  }
  return out;
}

function skipString(source: string, index: number): number {
  const quote = source[index];
  let cursor = index + 1;
  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (source[cursor] === quote) return cursor + 1;
    cursor += 1;
  }
  return cursor;
}

function skipGroup(source: string, index: number): number {
  let depth = 0;
  let cursor = index;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '"' || char === "'") {
      cursor = skipString(source, cursor);
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
    cursor += 1;
  }
  return cursor;
}

function isSpace(char: string | undefined): boolean {
  return (
    char === " " ||
    char === "\n" ||
    char === "\t" ||
    char === "\r" ||
    char === "\f"
  );
}

function isIdentStart(char: string): boolean {
  return /[A-Za-z_\\]/.test(char);
}

function isIdentChar(char: string): boolean {
  return /[A-Za-z0-9_-]/.test(char);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
