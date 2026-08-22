import { Pool, neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePool } from "drizzle-orm/neon-serverless";
import * as schema from "@/db/schema";

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DatabaseConfigurationError";
  }
}

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(url: string) {
  return drizzle(neon(url), { schema });
}

let database: Database | undefined;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDatabase() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new DatabaseConfigurationError();
  database ??= createDatabase(url);
  return database;
}

// Session 04 shipped a migration that was never applied to production, so
// `briefing_runs` silently didn't exist for a day. `select 1 from teams`
// can't see that drift — it only proves the connection and one table work.
const EXPECTED_TABLES = [
  "teams",
  "games",
  "team_games",
  "game_snapshots",
  "ingestion_runs",
  "briefing_runs",
  "users",
  "accounts",
  "sessions",
  "verification_tokens",
  "credit_entries",
  "wagers",
  "groups",
  "group_members",
  "group_invites",
  "buddy_messages",
] as const;

export async function checkDatabaseConnection() {
  const startedAt = Date.now();
  if (!isDatabaseConfigured()) {
    return {
      status: "unconfigured" as const,
      durationMs: 0,
      missingTables: [] as string[],
    };
  }
  try {
    const tableNames = sql.join(
      EXPECTED_TABLES.map((name) => sql`${name}`),
      sql`, `,
    );
    const result = await getDatabase().execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in (${tableNames})
    `);
    const found = new Set(result.rows.map((row) => row.table_name));
    const missingTables = EXPECTED_TABLES.filter((name) => !found.has(name));
    return {
      status: "healthy" as const,
      durationMs: Date.now() - startedAt,
      missingTables,
    };
  } catch {
    return {
      status: "unavailable" as const,
      durationMs: Date.now() - startedAt,
      missingTables: [] as string[],
    };
  }
}

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new DatabaseConfigurationError();
  return url;
}

export async function withDatabaseTransaction<T>(
  work: (
    transaction: Parameters<
      Parameters<ReturnType<typeof drizzlePool>["transaction"]>[0]
    >[0],
  ) => Promise<T>,
) {
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  const database = drizzlePool(pool, { schema });
  try {
    return await database.transaction(work);
  } finally {
    await pool.end();
  }
}
