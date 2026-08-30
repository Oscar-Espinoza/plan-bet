import { Pool, neon } from "@neondatabase/serverless";
import { Table, getTableName, is, sql } from "drizzle-orm";
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

/**
 * The Neon HTTP driver cannot reach a plain PostgreSQL container, so an
 * integration test builds its own postgres-js handle and installs it here.
 * Without this, the only way to run `src/data/*` against real SQL is to
 * re-type its statements by hand in the test — which proves the schema and
 * nothing at all about the code that ships.
 */
export function setDatabaseForTests(replacement: unknown) {
  database = replacement as Database;
}

// Session 04 shipped a migration that was never applied to production, so
// a generated table silently didn't exist for a day. `select 1 from teams`
// can't see that drift — it only proves the connection and one table work.
// Derived, not hand-listed: the list drifted four tables behind between 0008
// and 0010 (buddy_notes, provider_cache, fixture_context, game_comments) and
// silently stopped being able to catch the very drift it exists for.
const EXPECTED_TABLES = (Object.values(schema) as unknown[])
  .filter((value): value is Table => is(value, Table))
  .map(getTableName);

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
