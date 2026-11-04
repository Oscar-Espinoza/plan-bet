#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = path.join(root, "static");

async function encodeWebpToAvif(relativePath) {
  const input = path.join(staticDir, relativePath);
  const output = input.replace(/\.webp$/i, ".avif");
  const buffer = await readFile(input);
  const avif = await sharp(buffer).avif({ quality: 50, effort: 4 }).toBuffer();
  await writeFile(output, avif);
  console.log(`${relativePath} → ${path.basename(output)} (${avif.length} B)`);
}

async function walkWebp(dir, out = []) {
  for (const name of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) await walkWebp(full, out);
    else if (name.name.endsWith(".webp")) out.push(full);
  }
  return out;
}

const stadium = ["assets/night-stadium.webp", "assets/night-stadium-800.webp"];

for (const file of stadium) {
  await encodeWebpToAvif(file);
}

const crestDir = path.join(staticDir, "team-logos", "football");
for (const full of await walkWebp(crestDir)) {
  const relative = path.relative(staticDir, full);
  await encodeWebpToAvif(relative);
}

console.log("ENCODE IMAGES OK");
