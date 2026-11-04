/**
 * Compare an NDJSON export with D1.
 *
 *   pnpm migrate:reconcile -- --source migration-out --d1 local|preview|prod
 *
 * prod is refused unless MP_RECONCILE_PROD=1. It reads the top-level DB binding.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { arg, repoRoot } from "./files.ts";
import {
  planTransform,
  sourceUserMetrics,
  toEpochMs,
  uuidText,
  type Row,
  type UserMetrics,
} from "./mapping.ts";
import { quoteIdent } from "./sql-text.ts";
import { RECONCILE_TABLES, SOURCE_TABLES } from "./tables.ts";

const sourceDir = arg("--source");
const target = arg("--d1");
if (!sourceDir || !target) {
  console.error(
    "Usage: reconcile.ts --source <ndjson dir> --d1 <local|preview|prod>",
  );
  process.exit(1);
}
if (target !== "local" && target !== "preview" && target !== "prod") {
  console.error("--d1 must be local, preview, or prod");
  process.exit(1);
}
if (target === "prod" && process.env.MP_RECONCILE_PROD !== "1") {
  console.error(
    "Refusing production reconcile. Set MP_RECONCILE_PROD=1 to read production D1.",
  );
  process.exit(1);
}

const started = Date.now();
const root = repoRoot();
const dir = resolve(sourceDir);
const exportManifest = JSON.parse(
  readFileSync(resolve(dir, "manifest.json"), "utf8"),
) as {
  exportedAt?: string;
};
if (!exportManifest.exportedAt) {
  console.error("manifest.json has no exportedAt");
  process.exit(1);
}

const loaded = new Map<string, Row[]>();
for (const table of SOURCE_TABLES) {
  loaded.set(table.name, readNdjson(resolve(dir, `${table.name}.ndjson`)));
}
const plan = planTransform(loaded, toEpochMs(exportManifest.exportedAt));
for (const warning of plan.warnings) console.log(`RECONCILE note: ${warning}`);
if (plan.failed) {
  console.error("RECONCILE FAIL transform would reject this export");
  console.error(plan.failure);
  process.exit(1);
}

const documented = JSON.parse(
  readFileSync(resolve(dir, "manifest-transform.json"), "utf8"),
) as { failed?: boolean; counts?: Record<string, { imported?: number }> };
if (documented.failed) {
  console.error("RECONCILE FAIL manifest-transform.json is a failed transform");
  process.exit(1);
}
const mismatches: string[] = [];
for (const name of RECONCILE_TABLES) {
  const expected = plan.counts[name]?.imported;
  const written = documented.counts?.[name]?.imported;
  if (expected !== written) {
    mismatches.push(
      `manifest table ${name} imported=${String(written)} recomputed=${String(expected)}`,
    );
  }
}

const userTable = plan.tables.find((table) => table.target === "user");
const userIds = (userTable?.rows ?? []).map((row) => String(row[0]));
const expectedUsers = sourceUserMetrics(
  userIds,
  loaded.get("wagers") ?? [],
  loaded.get("credit_entries") ?? [],
);
const actualUsers = new Map<string, UserMetrics>();
for (const row of d1(userMetricsSql()) as Record<string, unknown>[]) {
  const id = uuidText(row.id);
  if (!id) continue;
  actualUsers.set(id, {
    balance: asNum(row.balance),
    wagerCount: asNum(row.wager_count),
    openWagers: asNum(row.open_wagers),
    stakeSum: asNum(row.stake_sum),
    returnSum: asNum(row.return_sum),
  });
}

const userIdsSeen = new Set([...expectedUsers.keys(), ...actualUsers.keys()]);
for (const id of [...userIdsSeen].sort()) {
  const expected = expectedUsers.get(id);
  const actual = actualUsers.get(id);
  if (!expected) {
    mismatches.push(`user ${id} missing in source`);
    continue;
  }
  if (!actual) {
    mismatches.push(`user ${id} missing in d1`);
    continue;
  }
  for (const field of [
    "balance",
    "wagerCount",
    "openWagers",
    "stakeSum",
    "returnSum",
  ] as const) {
    if (expected[field] !== actual[field]) {
      mismatches.push(
        `user ${id} ${field} source=${expected[field]} d1=${actual[field]}`,
      );
    }
  }
}

const counts = new Map<string, number>();
for (const statement of tableCountSql()) {
  for (const row of d1(statement) as Record<string, unknown>[]) {
    counts.set(String(row.table_name), asNum(row.n));
  }
}
for (const name of RECONCILE_TABLES) {
  const expected = plan.counts[name]?.imported ?? 0;
  const actual = counts.get(name);
  if (actual !== expected) {
    mismatches.push(
      `table ${name} source_imported=${expected} d1=${String(actual)}`,
    );
  }
}

if (mismatches.length > 0) {
  for (const line of mismatches) console.log(`mismatch ${line}`);
  process.exit(1);
}

const ledgerFile = readFileSync(
  resolve(root, "scripts/verify/ledger-invariants.sql"),
  "utf8",
);
for (const statement of ledgerFile
  .split(";")
  .map((part) => part.trim())
  .filter((part) => part.length > 0)) {
  const violations = d1(statement);
  if (violations.length > 0) {
    console.log("mismatch ledger invariants");
    console.log(JSON.stringify(violations));
    process.exit(1);
  }
}

console.log(
  `RECONCILE OK users=${expectedUsers.size} tables=${RECONCILE_TABLES.length} elapsed_ms=${Date.now() - started}`,
);

function userMetricsSql(): string {
  return `
    select
      u.id as id,
      coalesce((select sum(amount) from credit_entries where user_id = u.id), 0) as balance,
      (select count(*) from wagers where user_id = u.id) as wager_count,
      (select count(*) from wagers w where w.user_id = u.id and not exists (
        select 1 from credit_entries c where c.wager_id = w.id and c.kind = 'return'
      )) as open_wagers,
      coalesce((select sum(stake) from wagers where user_id = u.id), 0) as stake_sum,
      coalesce((select sum(amount) from credit_entries where user_id = u.id and kind = 'return'), 0) as return_sum
    from "user" u
    order by u.id
  `;
}

function tableCountSql(): string[] {
  const queries: string[] = [];
  for (let start = 0; start < RECONCILE_TABLES.length; start += 5) {
    queries.push(
      RECONCILE_TABLES.slice(start, start + 5)
        .map(
          (name, index) =>
            `${index === 0 ? "" : "union all "}select '${name}' as table_name, count(*) as n from ${quoteIdent(name)}`,
        )
        .join("\n"),
    );
  }
  return queries;
}

function d1(command: string): unknown[] {
  const args = ["exec", "wrangler", "d1", "execute", "DB"];
  if (target === "local") args.push("--local", "--env", "preview");
  if (target === "preview") args.push("--remote", "--env", "preview");
  if (target === "prod") args.push("--remote");
  args.push("--json", "--command", command);
  let stdout = "";
  try {
    stdout = execFileSync("pnpm", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    const failed = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    console.error(failed.stderr || failed.stdout || failed.message);
    process.exit(1);
  }
  return parseWrangler(stdout);
}

function parseWrangler(stdout: string): unknown[] {
  const trimmed = stdout.trim();
  const json = trimmed.startsWith("[")
    ? trimmed
    : trimmed.slice(trimmed.indexOf("["), trimmed.lastIndexOf("]") + 1);
  const parsed = JSON.parse(json) as { results?: unknown[] }[];
  const results = parsed[0]?.results;
  if (!Array.isArray(results)) throw new Error("wrangler JSON has no results");
  return results;
}

function readNdjson(path: string): Row[] {
  const text = readFileSync(path, "utf8");
  if (text.trim() === "") return [];
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Row);
}

function asNum(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n))
    throw new Error(`bad number ${JSON.stringify(value)}`);
  return n;
}
