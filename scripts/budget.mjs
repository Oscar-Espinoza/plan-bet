import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const clientDir = ".svelte-kit/output/client";
const manifestPath = path.join(clientDir, ".vite/manifest.json");
const serverManifestPath = ".svelte-kit/output/server/manifest.js";

const routes = [
  {
    id: "/",
    limit: 60 * 1024,
    sources: [
      "src/routes/+page.svelte",
      "src/routes/+page.ts",
      "src/routes/+page.server.ts",
    ],
  },
  {
    id: "/games/[id]",
    limit: 80 * 1024,
    sources: [
      "src/routes/games/[id]/+page.svelte",
      "src/routes/games/[id]/+page.ts",
      "src/routes/games/[id]/+page.server.ts",
    ],
  },
];

if (!existsSync(manifestPath)) {
  console.error(`missing client manifest at ${manifestPath}`);
  process.exit(1);
}

/** @type {Record<string, { file?: string, name?: string, imports?: string[], dynamicImports?: string[] }>} */
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function walkJs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walkJs(full, out);
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

const zodHits = walkJs(clientDir).filter((file) =>
  readFileSync(file, "utf8").includes("ZodError"),
);
if (zodHits.length > 0) {
  console.error("ZodError reached the client:");
  for (const file of zodHits) console.error(`  ${file}`);
  process.exit(1);
}

function findKey(predicate) {
  return Object.keys(manifest).find((key) => predicate(key, manifest[key]));
}

const startKey = findKey(
  (_, chunk) =>
    chunk.name === "entry/start" ||
    Boolean(chunk.file?.includes("/entry/start.")),
);
const appKey = findKey(
  (_, chunk) =>
    chunk.name === "entry/app" || Boolean(chunk.file?.includes("/entry/app.")),
);

if (!startKey || !appKey) {
  console.error("client manifest is missing the start or app entry");
  process.exit(1);
}

/** @param {string | undefined} key @param {Set<string>} seen */
function staticImports(key, seen = new Set()) {
  if (!key || seen.has(key) || !manifest[key]) return seen;
  seen.add(key);
  for (const imported of manifest[key].imports ?? [])
    staticImports(imported, seen);
  return seen;
}

function filesOf(keys) {
  /** @type {Set<string>} */
  const files = new Set();
  for (const key of keys) {
    const file = manifest[key]?.file;
    if (file?.endsWith(".js")) files.add(file);
  }
  return files;
}

// First load boots start, the client runtime it dynamically imports, and app.
// Route nodes stay dynamic imports of app and are added per route below.
const runtimeKey = manifest[startKey].dynamicImports?.find((key) =>
  key.includes("/client-entry.js"),
);
const shared = filesOf(
  new Set([
    ...staticImports(startKey),
    ...staticImports(runtimeKey),
    ...staticImports(appKey),
  ]),
);

function routeNodeIndexes(id) {
  const source = readFileSync(serverManifestPath, "utf8");
  const marker = `id: ${JSON.stringify(id)},`;
  const at = source.indexOf(marker);
  if (at === -1) return null;
  const page = source.slice(at, at + 600).match(/page:\s*\{([^}]*)\}/);
  if (!page || /\bnull\b/.test(page[1])) return null;
  const layouts = page[1]
    .match(/layouts:\s*\[([^\]]*)\]/)?.[1]
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "" && part !== "undefined")
    .map(Number);
  const leaf = Number(page[1].match(/leaf:\s*(\d+)/)?.[1]);
  if (
    !layouts ||
    layouts.some((index) => Number.isNaN(index)) ||
    Number.isNaN(leaf)
  )
    return null;
  return [...layouts, leaf];
}

function nodeKey(index) {
  return findKey((key) =>
    key.replaceAll("\\", "/").endsWith(`/nodes/${index}.js`),
  );
}

let failed = false;
for (const route of routes) {
  if (!route.sources.some((source) => existsSync(source))) {
    console.log(`${route.id} n/a`);
    continue;
  }

  const indexes = routeNodeIndexes(route.id);
  if (!indexes) {
    console.error(
      `${route.id} exists but is missing from the server route manifest`,
    );
    failed = true;
    continue;
  }

  const keys = indexes.map(nodeKey);
  if (keys.some((key) => !key)) {
    console.error(`${route.id} is missing a node chunk in the client manifest`);
    failed = true;
    continue;
  }

  const files = new Set(shared);
  for (const key of keys) {
    for (const file of filesOf(staticImports(key))) files.add(file);
  }

  const bytes = [...files].reduce(
    (sum, file) =>
      sum + gzipSync(readFileSync(path.join(clientDir, file))).length,
    0,
  );
  console.log(`${route.id} ${bytes}`);
  // Spec §1: a miss up to 25% over target is recorded for Oscar to decide;
  // only a miss beyond that fails the gate.
  const hardLimit = Math.round(route.limit * 1.25);
  if (bytes > hardLimit) {
    console.error(
      `${route.id} is ${bytes} bytes gzip, more than 25% over the ${route.limit} target (hard limit ${hardLimit})`,
    );
    failed = true;
  } else if (bytes > route.limit) {
    console.warn(
      `BUDGET WARN ${route.id} is ${bytes} bytes gzip, over the ${route.limit} target (record it in the log; fails above ${hardLimit})`,
    );
  }
}

if (failed) process.exit(1);
