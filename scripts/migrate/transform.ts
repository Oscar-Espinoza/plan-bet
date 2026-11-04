/**
 * Turn an export-neon snapshot into D1 import SQL.
 *
 *   pnpm migrate:transform -- [--source migration-out]
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { arg, repoRoot } from "./files.ts";
import { planTransform, toEpochMs, type Row } from "./mapping.ts";
import { MAX_STATEMENT_BYTES, insertStatements } from "./sql-text.ts";
import { SOURCE_TABLES } from "./tables.ts";

const sourceDir = resolve(arg("--source") ?? "migration-out");
const started = Date.now();
const manifestPath = resolve(sourceDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  exportedAt?: string;
};
if (!manifest.exportedAt) {
  console.error("manifest.json has no exportedAt");
  process.exit(1);
}
const exportedAtMs = toEpochMs(manifest.exportedAt);

const loaded = new Map<string, Row[]>();
for (const table of SOURCE_TABLES) {
  loaded.set(
    table.name,
    readNdjson(resolve(sourceDir, `${table.name}.ndjson`)),
  );
}

const plan = planTransform(loaded, exportedAtMs);
const manifestOut = resolve(sourceDir, "manifest-transform.json");
writeFileSync(
  manifestOut,
  `${JSON.stringify(
    {
      exportedAt: manifest.exportedAt,
      transformedAt: new Date().toISOString(),
      failed: plan.failed,
      failure: plan.failure,
      warnings: plan.warnings,
      skippedUsers: plan.skippedUsers,
      notMigrated: plan.notMigrated,
      counts: plan.counts,
    },
    null,
    2,
  )}\n`,
);

for (const warning of plan.warnings)
  console.log(`TRANSFORM warning: ${warning}`);

const importPath = resolve(sourceDir, "import.sql");
if (plan.failed) {
  if (existsSync(importPath)) unlinkSync(importPath);
  console.error("TRANSFORM FAIL");
  console.error(plan.failure);
  process.exit(1);
}

const triggerSql = grantTrigger();
const statements = [
  "PRAGMA defer_foreign_keys = true;\n",
  "DROP TRIGGER IF EXISTS user_starting_grant;\n",
];
for (const table of plan.tables) {
  statements.push(...insertStatements(table.target, table.columns, table.rows));
}
statements.push(triggerSql.endsWith("\n") ? triggerSql : `${triggerSql}\n`);

for (const statement of statements) {
  const size = Buffer.byteLength(statement);
  if (size >= MAX_STATEMENT_BYTES) {
    throw new Error(`statement is ${size} bytes`);
  }
}

const sql = statements.join("");
if (!sql.startsWith("PRAGMA defer_foreign_keys = true;\n")) {
  throw new Error("import.sql must start with the defer pragma");
}
if (!sql.includes(triggerSql)) {
  throw new Error("grant trigger text is not byte-identical to the migration");
}
const dropAt = sql.indexOf("DROP TRIGGER IF EXISTS user_starting_grant;");
const userAt = sql.indexOf('INSERT INTO "user"');
const triggerAt = sql.lastIndexOf("CREATE TRIGGER user_starting_grant");
if (dropAt < 0 || triggerAt < 0 || dropAt > triggerAt) {
  throw new Error("grant trigger must be dropped and then recreated");
}
if (userAt !== -1 && !(dropAt < userAt && userAt < triggerAt)) {
  throw new Error("grant trigger must be dropped before user rows are loaded");
}

writeFileSync(importPath, sql);
console.log(
  `TRANSFORM OK import=${importPath} statements=${statements.length} bytes=${Buffer.byteLength(sql)} elapsed_ms=${Date.now() - started}`,
);

function readNdjson(path: string): Row[] {
  const text = readFileSync(path, "utf8");
  if (text.trim() === "") return [];
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Row);
}

function grantTrigger(): string {
  const file = readFileSync(
    resolve(repoRoot(), "drizzle/0001_starting_grant_trigger.sql"),
    "utf8",
  );
  const start = file.indexOf("CREATE TRIGGER");
  if (start < 0) throw new Error("starting grant trigger is missing from 0001");
  return file.slice(start);
}
