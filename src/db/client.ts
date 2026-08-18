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

export async function checkDatabaseConnection() {
  const startedAt = Date.now();
  if (!isDatabaseConfigured()) {
    return { status: "unconfigured" as const, durationMs: 0 };
  }
  try {
    await getDatabase().execute(sql`select 1 from teams limit 1`);
    return { status: "healthy" as const, durationMs: Date.now() - startedAt };
  } catch {
    return {
      status: "unavailable" as const,
      durationMs: Date.now() - startedAt,
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
