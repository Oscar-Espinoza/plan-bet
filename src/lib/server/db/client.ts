import { env } from "cloudflare:workers";
import { Table, getTableName, is, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/d1";
import journal from "../../../../drizzle/meta/_journal.json";
import * as schema from "./schema";

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("DB binding is not configured");
    this.name = "DatabaseConfigurationError";
  }
}

export type Database = ReturnType<typeof drizzle<typeof schema>>;

type Statement = BatchItem<"sqlite">;

const BUNDLED_MIGRATIONS = journal.entries.map((entry) => `${entry.tag}.sql`);

const EXPECTED_TABLES = (Object.values(schema) as unknown[])
  .filter((value): value is Table => is(value, Table))
  .map(getTableName);

let database: Database | undefined;

export function isDatabaseConfigured() {
  return Boolean(env.DB);
}

export function getDatabase() {
  if (!env.DB) throw new DatabaseConfigurationError();
  database ??= drizzle(env.DB, { schema });
  return database;
}

/**
 * D1 runs the statements as one transaction. Heterogeneous builders share
 * BatchItem; Drizzle's batch generic wants one statement type, so the cast
 * stays inside this helper.
 */
export function runBatch(
  statements: readonly Statement[],
): Promise<readonly unknown[]> {
  if (statements.length === 0) {
    throw new Error("runBatch requires at least one statement");
  }
  return getDatabase().batch(
    statements as unknown as Parameters<Database["batch"]>[0],
  );
}

function migrationFileName(name: string) {
  return name.endsWith(".sql") ? name : `${name}.sql`;
}

/**
 * Pending count is the bundled drizzle journal (`drizzle/<tag>.sql`) minus
 * rows in wrangler's `d1_migrations` table. Null when that table can't be read.
 */
async function countPendingMigrations(): Promise<number | null> {
  try {
    const rows = await getDatabase().all<{ name: string }>(
      sql`select name from d1_migrations`,
    );
    const applied = new Set(rows.map((row) => migrationFileName(row.name)));
    return BUNDLED_MIGRATIONS.filter((name) => !applied.has(name)).length;
  } catch {
    return null;
  }
}

export async function checkDatabaseConnection() {
  const startedAt = Date.now();
  if (!isDatabaseConfigured()) {
    return {
      status: "unconfigured" as const,
      durationMs: 0,
      missingTables: [] as string[],
      pendingMigrations: null,
    };
  }
  try {
    const rows = await getDatabase().all<{ name: string }>(
      sql`select name from sqlite_master where type = 'table'`,
    );
    const found = new Set(rows.map((row) => row.name));
    const missingTables = EXPECTED_TABLES.filter((name) => !found.has(name));
    const pendingMigrations = await countPendingMigrations();
    return {
      status: "healthy" as const,
      durationMs: Date.now() - startedAt,
      missingTables,
      pendingMigrations,
    };
  } catch {
    return {
      status: "unavailable" as const,
      durationMs: Date.now() - startedAt,
      missingTables: [] as string[],
      pendingMigrations: null,
    };
  }
}
