import path from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let container: StartedPostgreSqlContainer;
let sql: Sql;

async function seedTeams() {
  const values = [
    ["real-madrid", "soccer", "football-data", "86", "Real Madrid"],
    ["barcelona", "soccer", "football-data", "81", "FC Barcelona"],
    ["new-york-yankees", "baseball", "mlb-stats", "147", "New York Yankees"],
    ["boston-red-sox", "baseball", "mlb-stats", "111", "Boston Red Sox"],
  ] as const;
  for (const [slug, sport, provider, externalId, name] of values) {
    await sql`
      insert into teams (
        slug, sport, provider, external_id, canonical,
        source_observed_at, fetched_at, expires_at, payload_hash
      ) values (
        ${slug}, ${sport}, ${provider}, ${externalId},
        ${JSON.stringify({ slug, sport, name })}::jsonb,
        now(), now(), now(), ${`hash-${slug}`}
      ) on conflict (slug) do nothing
    `;
  }
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  sql = postgres(container.getConnectionUri(), { max: 2 });
  await migrate(drizzle(sql), {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });
});

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

describe("Session 03 shared sports persistence", () => {
  it("applies to an empty PostgreSQL 18 database", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `;
    expect(rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "game_snapshots",
        "games",
        "ingestion_runs",
        "team_games",
        "teams",
      ]),
    );
  });

  it("seeds configured teams idempotently", async () => {
    await seedTeams();
    await seedTeams();
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from teams
    `;
    expect(count).toBe(4);
  });

  it("stores one provider game and associates it with both tracked teams", async () => {
    await seedTeams();
    const [game] = await sql<{ id: string }[]>`
      insert into games (
        canonical_id, sport, provider, external_id, summary, scheduled_at,
        source_observed_at, fetched_at, expires_at, payload_hash
      ) values (
        'football-data-600002', 'soccer', 'football-data', '600002',
        ${JSON.stringify({ id: "football-data-600002-real-madrid" })}::jsonb,
        '2026-08-24T19:00:00Z', now(), now(), now(), 'game-hash'
      ) returning id
    `;
    await sql`
      insert into team_games (team_id, game_id)
      select id, ${game!.id} from teams where sport = 'soccer'
      on conflict do nothing
    `;
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from team_games where game_id = ${game!.id}
    `;
    expect(count).toBe(2);

    await expect(
      sql`
        insert into games (
          canonical_id, sport, provider, external_id, summary, scheduled_at,
          source_observed_at, fetched_at, expires_at, payload_hash
        ) values (
          'another-id', 'soccer', 'football-data', '600002', '{}',
          now(), now(), now(), now(), 'duplicate'
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("allows only one active refresh lease", async () => {
    await sql`
      insert into ingestion_runs (
        provider, operation, scope, status, request_id
      ) values (
        'football-data', 'refresh_soccer', 'configured-teams', 'running', 'one'
      )
    `;
    await expect(
      sql`
        insert into ingestion_runs (
          provider, operation, scope, status, request_id
        ) values (
          'mlb-stats', 'refresh_baseball', 'configured-teams', 'running', 'mlb-one'
        )
      `,
    ).resolves.toBeDefined();
    await expect(
      sql`
        insert into ingestion_runs (
          provider, operation, scope, status, request_id
        ) values (
          'football-data', 'refresh_soccer', 'configured-teams', 'running', 'two'
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });
    await sql`
      update ingestion_runs
      set status = 'succeeded', completed_at = now()
      where request_id = 'one'
    `;
    await expect(
      sql`
        insert into ingestion_runs (
          provider, operation, scope, status, request_id
        ) values (
          'football-data', 'refresh_soccer', 'configured-teams', 'running', 'two'
        )
      `,
    ).resolves.toBeDefined();
  });

  it("stores one MLB game with independent team-perspective snapshots idempotently", async () => {
    await seedTeams();
    const [game] = await sql<{ id: string }[]>`
      insert into games (
        canonical_id, sport, provider, external_id, summary, scheduled_at,
        source_observed_at, fetched_at, expires_at, payload_hash
      ) values (
        'mlb-900001', 'baseball', 'mlb-stats', '900001',
        ${JSON.stringify({ id: "mlb-900001-new-york-yankees" })}::jsonb,
        '2026-08-20T23:05:00Z', now(), now(), now(), 'mlb-game-hash'
      ) on conflict (canonical_id) do update set payload_hash = excluded.payload_hash
      returning id
    `;
    await sql`
      insert into team_games (team_id, game_id)
      select id, ${game!.id} from teams where sport = 'baseball'
      on conflict do nothing
    `;
    for (const slug of ["new-york-yankees", "boston-red-sox"] as const) {
      await sql`
        insert into game_snapshots (
          route_id, game_id, team_id, snapshot, source_observed_at,
          fetched_at, expires_at, payload_hash
        ) select
          ${`mlb-900001-${slug}`}, ${game!.id}, id,
          ${JSON.stringify({ game: { id: `mlb-900001-${slug}` } })}::jsonb,
          now(), now(), now(), ${`snapshot-${slug}`}
        from teams where slug = ${slug}
        on conflict (route_id) do update set payload_hash = excluded.payload_hash
      `;
    }
    const [{ games: gameCount, snapshots: snapshotCount }] = await sql<
      { games: number; snapshots: number }[]
    >`
      select
        (select count(*)::int from games where external_id = '900001') as games,
        (select count(*)::int from game_snapshots where route_id like 'mlb-900001-%') as snapshots
    `;
    expect({ gameCount, snapshotCount }).toEqual({
      gameCount: 1,
      snapshotCount: 2,
    });
  });

  it("retains the last-known-good snapshot when a refresh transaction fails", async () => {
    await seedTeams();
    const [team] = await sql<{ id: string }[]>`
      select id from teams where slug = 'real-madrid'
    `;
    const [game] = await sql<{ id: string }[]>`
      select id from games where external_id = '600002'
    `;
    await sql`
      insert into game_snapshots (
        route_id, game_id, team_id, snapshot, source_observed_at,
        fetched_at, expires_at, payload_hash
      ) values (
        'football-data-600002-real-madrid', ${game!.id}, ${team!.id},
        ${JSON.stringify({ version: "known-good" })}::jsonb,
        now(), now(), now(), 'known-good'
      )
    `;

    await expect(
      sql.begin(async (transaction) => {
        await transaction`
          update game_snapshots
          set snapshot = ${JSON.stringify({ version: "partial" })}::jsonb,
              payload_hash = 'partial'
          where route_id = 'football-data-600002-real-madrid'
        `;
        throw new Error("simulated provider failure");
      }),
    ).rejects.toThrow("simulated provider failure");

    const [snapshot] = await sql<
      { payload_hash: string; snapshot: { version: string } }[]
    >`
      select payload_hash, snapshot
      from game_snapshots
      where route_id = 'football-data-600002-real-madrid'
    `;
    expect(snapshot).toEqual({
      payload_hash: "known-good",
      snapshot: { version: "known-good" },
    });
  });
});
