/**
 * Read-only snapshot of a Postgres database into NDJSON.
 * Production runs are for Oscar or the coordinator, never a builder.
 *
 *   pnpm migrate:export -- --url-env DATABASE_URL --env-file <path>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { arg, readEnvFile } from "./files.ts";
import { quoteIdent } from "./sql-text.ts";
import { SOURCE_TABLES } from "./tables.ts";

const urlEnv = arg("--url-env");
const envFile = arg("--env-file");
const outDir = resolve(arg("--out") ?? "migration-out");

if (!urlEnv || !envFile) {
  console.error(
    "Usage: export-neon.ts --url-env <VAR> --env-file <path> [--out migration-out]",
  );
  process.exit(1);
}

const env = readEnvFile(envFile);
const url = env[urlEnv]?.trim();
if (!url) {
  console.error(`Env file has no value for ${urlEnv}`);
  process.exit(1);
}

const started = Date.now();
const exportedAt = new Date().toISOString();
const sql = postgres(url, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
  onnotice: () => {},
  connection: {
    default_transaction_read_only: true,
  },
});

try {
  mkdirSync(outDir, { recursive: true });
  const counts: Record<string, number> = {};
  await sql.begin("isolation level repeatable read read only", async (tx) => {
    for (const table of SOURCE_TABLES) {
      const query = `select * from ${quoteIdent(table.name)} order by ${table.orderBy.map(quoteIdent).join(", ")}`;
      const result = await tx.unsafe(query);
      const lines: string[] = [];
      for (const row of result) {
        lines.push(JSON.stringify(rowObject(row)));
      }
      writeFileSync(
        resolve(outDir, `${table.name}.ndjson`),
        lines.length > 0 ? `${lines.join("\n")}\n` : "",
      );
      counts[table.name] = lines.length;
      console.log(`EXPORT table=${table.name} rows=${lines.length}`);
    }
  });
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  writeFileSync(
    resolve(outDir, "manifest.json"),
    `${JSON.stringify(
      {
        exportedAt,
        isolation: "repeatable read read only",
        tables: counts,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `EXPORT OK tables=${SOURCE_TABLES.length} rows=${total} elapsed_ms=${Date.now() - started}`,
  );
} finally {
  await sql.end({ timeout: 5 });
}

function rowObject(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== "object") throw new Error("unexpected row");
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (/^\d+$/.test(key)) continue;
    out[key] = normalize(record[key]);
  }
  if (Object.keys(out).length === 0) throw new Error("row had no column names");
  return out;
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = normalize(item);
    return out;
  }
  return value;
}
