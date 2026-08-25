import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setDatabaseForTests } from "@/db/client";
import { listBoardContext } from "@/data/fixture-context-repository";
import { resolveContext } from "@/data/buddy";

// Same shape as src/data/game-comments.integration.test.ts: app code speaks
// the Neon driver and can't reach a plain Postgres container, so this suite
// installs a postgres-js handle through `setDatabaseForTests` and drives the
// real `listBoardContext` / `resolveContext` — the functions the buddy route
// actually calls, never a hand-copied mirror of their SQL.
let container: StartedPostgreSqlContainer;
let sql: Sql;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  sql = postgres(container.getConnectionUri(), { max: 2 });
  await migrate(drizzle(sql), {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });
  // getDatabase() throws DatabaseConfigurationError unless this is set, even
  // once a handle is installed below — the value itself is never read. It's
  // also what makes isDatabaseConfigured() true, the gate resolveContext
  // checks before it ever reaches for the board.
  process.env.DATABASE_URL = container.getConnectionUri();
  setDatabaseForTests(drizzle(sql));
});

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

/** A GameSummary literal that passes gameSummarySchema — copied from the
 * boardRow() helper in src/data/buddy.test.ts, the known-valid shape. */
function validSummary(canonicalId: string) {
  return {
    id: canonicalId,
    sport: "soccer" as const,
    teamSlug: "real-madrid" as const,
    competition: "La Liga",
    homeTeam: "Real Madrid",
    awayTeam: "Barcelona",
    scheduledAt: "2026-09-01T19:00:00.000Z",
    status: "scheduled" as const,
  };
}

/** Inserts a `games` row with a real, parseable summary by default — unlike
 * the game-comments helper's `'{}'`, which is exactly the unparseable case
 * this file needs for the last test. `minutesAhead` may be negative to
 * place kickoff in the past. */
async function createGame(
  canonicalId: string,
  options: { minutesAhead?: number; summary?: unknown } = {},
) {
  const minutesAhead = options.minutesAhead ?? 60;
  // A JS Date can't be bound here (postgres-js rejects it for this
  // parameter); an ISO string is what the game-comments helper's interval
  // fragment achieves the long way round.
  const scheduledAt = new Date(
    Date.now() + minutesAhead * 60_000,
  ).toISOString();
  const summary = options.summary ?? validSummary(canonicalId);
  const [row] = await sql<{ id: string }[]>`
    insert into games (
      canonical_id, sport, provider, external_id, summary, scheduled_at,
      source_observed_at, fetched_at, expires_at, payload_hash
    ) values (
      ${canonicalId}, 'soccer', 'football-data', ${canonicalId},
      ${JSON.stringify(summary)}::jsonb, ${scheduledAt},
      now(), now(), now(), ${`hash-${canonicalId}`}
    )
    returning id
  `;
  return row!.id;
}

async function buildContext(
  gameId: string,
  options: { summary?: string } = {},
) {
  const summary = options.summary ?? "Nothing dramatic, form as expected.";
  await sql`
    insert into fixture_context (game_id, facts, summary, built_at)
    values (${gameId}, '[]'::jsonb, ${summary}, now())
  `;
}

describe("Phase G7 recall context", () => {
  // MUST run first. The container is shared across every test in this file
  // and listBoardContext is unscoped by design, so this is the one moment
  // the board is genuinely empty — every later test can only add rows.
  it("resolveContext returns none for an empty board, even with a database configured", async () => {
    const result = await resolveContext("/", {});
    expect(result).toEqual({ context: { kind: "none" }, routeLabel: "none" });
  });

  it("listBoardContext returns a fixture that has context, and omits an upcoming game with no fixture_context row", async () => {
    const withContextId = `football-data-${randomUUID().slice(0, 8)}`;
    const withoutContextId = `football-data-${randomUUID().slice(0, 8)}`;
    const gameId = await createGame(withContextId, { minutesAhead: 60 });
    await createGame(withoutContextId, { minutesAhead: 90 });
    await buildContext(gameId);

    const rows = await listBoardContext({ limit: 100 });
    const ids = rows.map((row) => row.canonicalId);
    expect(ids).toContain(withContextId);
    expect(ids).not.toContain(withoutContextId);
  });

  it("omits a fixture whose kickoff has passed, even with context built", async () => {
    const pastId = `football-data-${randomUUID().slice(0, 8)}`;
    const gameId = await createGame(pastId, { minutesAhead: -60 });
    await buildContext(gameId, { summary: "already kicked off" });

    const rows = await listBoardContext({ limit: 100 });
    expect(rows.map((row) => row.canonicalId)).not.toContain(pastId);
  });

  it("returns nearest kickoff first", async () => {
    const nearId = `football-data-${randomUUID().slice(0, 8)}`;
    const farId = `football-data-${randomUUID().slice(0, 8)}`;
    const farGameId = await createGame(farId, { minutesAhead: 500 });
    const nearGameId = await createGame(nearId, { minutesAhead: 10 });
    await buildContext(farGameId);
    await buildContext(nearGameId);

    const rows = await listBoardContext({ limit: 100 });
    const relevantIds = rows
      .map((row) => row.canonicalId)
      .filter((id) => id === nearId || id === farId);
    expect(relevantIds).toEqual([nearId, farId]);
  });

  it("honours limit, with more rows present than the limit asks for", async () => {
    for (let i = 0; i < 5; i++) {
      const id = `football-data-${randomUUID().slice(0, 8)}`;
      const gameId = await createGame(id, { minutesAhead: 120 + i });
      await buildContext(gameId);
    }
    const rows = await listBoardContext({ limit: 3 });
    expect(rows).toHaveLength(3);
  });

  it("resolveContext returns recall with one fact per built fixture, ids recall-<canonicalId>", async () => {
    const canonicalId = `football-data-${randomUUID().slice(0, 8)}`;
    const gameId = await createGame(canonicalId, { minutesAhead: 5 });
    await buildContext(gameId, {
      summary: "Real Madrid vs Barcelona, no fresh injuries.",
    });

    const result = await resolveContext("/", {});
    expect(result.routeLabel).toBe("recall");
    expect(result.context.kind).toBe("recall");
    if (result.context.kind !== "recall") return;
    const fact = result.context.facts.find(
      (item) => item.id === `recall-${canonicalId}`,
    );
    expect(fact?.value).toBe("Real Madrid vs Barcelona, no fresh injuries.");
  });

  it("drops a fixture whose stored summary doesn't parse as GameSummary, keeping its valid siblings", async () => {
    const brokenId = `football-data-${randomUUID().slice(0, 8)}`;
    const validId = `football-data-${randomUUID().slice(0, 8)}`;
    const broken = validSummary(brokenId) as Record<string, unknown>;
    delete broken.homeTeam; // missing homeTeam fails gameSummarySchema
    const brokenGameId = await createGame(brokenId, {
      minutesAhead: 6,
      summary: broken,
    });
    const validGameId = await createGame(validId, { minutesAhead: 7 });
    await buildContext(brokenGameId, { summary: "broken row" });
    await buildContext(validGameId, { summary: "valid row" });

    const result = await resolveContext("/", {});
    expect(result.context.kind).toBe("recall");
    if (result.context.kind !== "recall") return;
    const ids = result.context.facts.map((item) => item.id);
    expect(ids).not.toContain(`recall-${brokenId}`);
    expect(ids).toContain(`recall-${validId}`);
  });
});
