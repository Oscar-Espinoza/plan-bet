import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type ISql, type Sql } from "postgres";
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

/**
 * The quota is enforced by counting briefing_runs rows for a hash over the
 * current UTC day inside one advisory-locked transaction, then inserting the
 * claimed row. These tests exercise that sequence directly, the same way the
 * refresh-lease tests exercise the partial unique index rather than its
 * TypeScript wrapper.
 */
const SESSION_LIMIT = 5;
const IP_LIMIT = 20;

/** The same UTC day boundary the repository computes in JavaScript. */
function utcDayStart(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

async function claimSlot(
  sessionHash: string,
  ipHash: string,
  startedAt = new Date(),
) {
  const dayStart = utcDayStart();
  return sql.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(1, hashtext(${sessionHash}))`;
    await transaction`select pg_advisory_xact_lock(2, hashtext(${ipHash}))`;
    const [session] = await transaction<{ used: number }[]>`
      select count(*)::int as used from briefing_runs
      where session_hash = ${sessionHash} and started_at >= ${dayStart}
    `;
    const [ip] = await transaction<{ used: number }[]>`
      select count(*)::int as used from briefing_runs
      where ip_hash = ${ipHash} and started_at >= ${dayStart}
    `;
    if (session!.used >= SESSION_LIMIT || ip!.used >= IP_LIMIT) return false;
    await transaction`
      insert into briefing_runs (
        route_id, sport, session_hash, ip_hash, model, prompt_version,
        schema_version, input_hash, status, request_id, started_at
      ) values (
        'football-data-600002-real-madrid', 'soccer', ${sessionHash}, ${ipHash},
        'test-model', 'v1', '1', 'input-hash', 'running', 'req-1',
        ${startedAt.toISOString()}
      )
    `;
    return true;
  });
}

/**
 * Drives raw `postgres` tagged SQL against the ledger, the same way the
 * refresh-lease and quota tests above exercise the partial unique indexes
 * directly rather than their TypeScript wrappers.
 */
async function createUser(email: string) {
  const [user] = await sql<{ id: string }[]>`
    insert into users (email) values (${email}) returning id
  `;
  return user!.id;
}

describe("Session 06 accounts and the credit ledger", () => {
  it("applies the accounts and credit ledger migration", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public'
    `;
    const names = rows.map((row) => row.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "users",
        "accounts",
        "sessions",
        "verification_tokens",
        "credit_entries",
      ]),
    );
  });

  it("rejects a second grant for the same user", async () => {
    const userId = await createUser(`grant-${randomUUID()}@example.com`);
    await sql`
      insert into credit_entries (user_id, kind, amount, reason)
      values (${userId}, 'grant', 1000, 'signup')
    `;
    await expect(
      sql`
        insert into credit_entries (user_id, kind, amount, reason)
        values (${userId}, 'grant', 1000, 'signup')
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("leaves exactly one grant row under concurrent inserts", async () => {
    const userId = await createUser(`concurrent-${randomUUID()}@example.com`);

    const results = await Promise.allSettled(
      Array.from(
        { length: 12 },
        () => sql`
          insert into credit_entries (user_id, kind, amount, reason)
          values (${userId}, 'grant', 1000, 'signup')
        `,
      ),
    );

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from credit_entries
      where user_id = ${userId} and kind = 'grant'
    `;
    expect(count).toBe(1);
  });

  it("computes balance as the sum of grant, stake, return, and reset entries", async () => {
    const userId = await createUser(`balance-${randomUUID()}@example.com`);
    await sql`
      insert into credit_entries (user_id, kind, amount, reason) values
        (${userId}, 'grant', 1000, 'signup'),
        (${userId}, 'stake', -150, 'wager placed'),
        (${userId}, 'return', 300, 'wager won'),
        (${userId}, 'reset', -1150, 'manual_reset')
    `;
    const [{ balance }] = await sql<{ balance: number }[]>`
      select coalesce(sum(amount), 0)::int as balance from credit_entries
      where user_id = ${userId}
    `;
    expect(balance).toBe(1000 - 150 + 300 - 1150);
  });

  it("cascades from users to credit_entries on delete, never updating or deleting a row directly", async () => {
    const userId = await createUser(`cascade-${randomUUID()}@example.com`);
    await sql`
      insert into credit_entries (user_id, kind, amount, reason)
      values (${userId}, 'grant', 1000, 'signup')
    `;
    await sql`delete from users where id = ${userId}`;
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from credit_entries where user_id = ${userId}
    `;
    expect(count).toBe(0);
  });

  it("leaves the ledger untouched when a transaction throws after inserting a stake", async () => {
    const userId = await createUser(`rollback-${randomUUID()}@example.com`);
    await sql`
      insert into credit_entries (user_id, kind, amount, reason)
      values (${userId}, 'grant', 1000, 'signup')
    `;

    await expect(
      sql.begin(async (transaction) => {
        await transaction`
          insert into credit_entries (user_id, kind, amount, reason)
          values (${userId}, 'stake', -150, 'wager placed')
        `;
        throw new Error("simulated failure after stake insert");
      }),
    ).rejects.toThrow("simulated failure after stake insert");

    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from credit_entries where user_id = ${userId}
    `;
    expect(count).toBe(1);
  });

  it("stores no free-text or PII column on credit_entries beyond reason", async () => {
    const columns = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'credit_entries'
    `;
    const names = columns.map((column) => column.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "user_id",
        "kind",
        "amount",
        "reason",
        "wager_id",
        "created_at",
      ]),
    );
    for (const forbidden of ["email", "name", "ip_address", "note"]) {
      expect(names).not.toContain(forbidden);
    }
  });
});

describe("Session 04 briefing runs and quotas", () => {
  it("applies the briefing_runs migration", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public'
    `;
    expect(rows.map((row) => row.table_name)).toContain("briefing_runs");
  });

  it("cannot exceed the session quota under concurrent claims", async () => {
    const sessionHash = `session-${randomUUID()}`;
    const ipHash = `ip-${randomUUID()}`;

    const results = await Promise.all(
      Array.from({ length: 12 }, () => claimSlot(sessionHash, ipHash)),
    );

    expect(results.filter(Boolean)).toHaveLength(SESSION_LIMIT);
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from briefing_runs
      where session_hash = ${sessionHash}
    `;
    expect(count).toBe(SESSION_LIMIT);
  });

  it("cannot exceed the IP quota across distinct sessions", async () => {
    const ipHash = `ip-${randomUUID()}`;
    const claims: Promise<boolean>[] = [];
    for (let i = 0; i < 6; i += 1) {
      const sessionHash = `session-${randomUUID()}`;
      for (let n = 0; n < SESSION_LIMIT; n += 1) {
        claims.push(claimSlot(sessionHash, ipHash));
      }
    }

    const results = await Promise.all(claims);
    expect(results.filter(Boolean)).toHaveLength(IP_LIMIT);
  });

  it("does not count rows from a previous UTC day", async () => {
    const sessionHash = `session-${randomUUID()}`;
    const ipHash = `ip-${randomUUID()}`;
    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);

    for (let n = 0; n < SESSION_LIMIT; n += 1) {
      await claimSlot(sessionHash, ipHash, yesterday);
    }

    await expect(claimSlot(sessionHash, ipHash)).resolves.toBe(true);
  });

  it("stores no raw address, watchlist text, or note", async () => {
    const columns = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'briefing_runs'
    `;
    const names = columns.map((column) => column.column_name);

    expect(names).toEqual(
      expect.arrayContaining([
        "session_hash",
        "ip_hash",
        "input_hash",
        "validation_status",
        "error_code",
      ]),
    );
    for (const forbidden of ["ip_address", "note", "watchlist", "user_text"]) {
      expect(names).not.toContain(forbidden);
    }
  });
});

/**
 * Replicates the shape of the placeWager transaction (advisory lock, balance
 * check, wager insert, stake ledger row) directly against raw SQL, the same
 * way claimSlot above exercises the briefing quota logic. App code speaks the
 * Neon driver and cannot connect to plain Postgres, so this suite proves the
 * schema and locking hold rather than calling the service.
 */
async function insertWagerRaw(
  client: ISql,
  input: {
    userId: string;
    canonicalGameId: string;
    routeId: string;
    stake: number;
  },
) {
  const [wager] = await client<{ id: string }[]>`
    insert into wagers (
      user_id, canonical_game_id, route_id, sport, market_id, selection_id,
      market_label, selection_label, price, stake, potential_return,
      matchup, competition, scheduled_at, prices_version, rules_version
    ) values (
      ${input.userId}, ${input.canonicalGameId}, ${input.routeId}, 'soccer',
      'soccer-match-result', 'home', 'Match Result', 'Home', 2.40,
      ${input.stake}, ${Math.round(input.stake * 2.4)},
      'Barcelona at Real Madrid', 'La Liga', now() + interval '1 day', 'v1', 'v1'
    )
    returning id
  `;
  return wager!.id;
}

async function placeWagerRaw(
  userId: string,
  canonicalGameId: string,
  stake: number,
) {
  return sql.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(4, hashtext(${userId}))`;
    const [balanceRow] = await transaction<{ balance: number }[]>`
      select coalesce(sum(amount), 0)::int as balance from credit_entries
      where user_id = ${userId}
    `;
    if (stake > balanceRow!.balance) return false;
    const wagerId = await insertWagerRaw(transaction, {
      userId,
      canonicalGameId,
      routeId: `${canonicalGameId}-real-madrid`,
      stake,
    });
    await transaction`
      insert into credit_entries (user_id, kind, amount, reason, wager_id)
      values (${userId}, 'stake', ${-stake}, 'wager placed', ${wagerId})
    `;
    return true;
  });
}

describe("Session 08 placing and locking a wager", () => {
  it("applies the wagers migration with no status or updated_at column", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public'
    `;
    expect(rows.map((row) => row.table_name)).toContain("wagers");

    const columns = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'wagers'
    `;
    const names = columns.map((column) => column.column_name);
    expect(names).not.toContain("status");
    expect(names).not.toContain("updated_at");
  });

  it("cannot drive the balance below zero under concurrent placements", async () => {
    const userId = await createUser(
      `wager-concurrency-${randomUUID()}@example.com`,
    );
    await sql`
      insert into credit_entries (user_id, kind, amount, reason)
      values (${userId}, 'grant', 100, 'signup')
    `;

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        placeWagerRaw(userId, "football-data-900001", 30),
      ),
    );

    // At most floor(100 / 30) = 3 placements can succeed.
    expect(results.filter(Boolean).length).toBeLessThanOrEqual(3);
    const [{ balance }] = await sql<{ balance: number }[]>`
      select coalesce(sum(amount), 0)::int as balance from credit_entries
      where user_id = ${userId}
    `;
    expect(balance).toBeGreaterThanOrEqual(0);
  });

  it("leaves neither wager nor ledger row when a transaction throws after inserting the wager", async () => {
    const userId = await createUser(
      `wager-rollback-${randomUUID()}@example.com`,
    );
    await sql`
      insert into credit_entries (user_id, kind, amount, reason)
      values (${userId}, 'grant', 1000, 'signup')
    `;

    await expect(
      sql.begin(async (transaction) => {
        await insertWagerRaw(transaction, {
          userId,
          canonicalGameId: "football-data-900002",
          routeId: "football-data-900002-real-madrid",
          stake: 50,
        });
        throw new Error("simulated failure after wager insert");
      }),
    ).rejects.toThrow("simulated failure after wager insert");

    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from wagers where user_id = ${userId}
    `;
    expect(count).toBe(0);
    const [{ count: stakeCount }] = await sql<{ count: number }[]>`
      select count(*)::int as count from credit_entries
      where user_id = ${userId} and kind = 'stake'
    `;
    expect(stakeCount).toBe(0);
  });

  it("enforces the credit_entries.wager_id FK and rejects a second return for the same wager", async () => {
    const userId = await createUser(`wager-fk-${randomUUID()}@example.com`);
    await sql`
      insert into credit_entries (user_id, kind, amount, reason)
      values (${userId}, 'grant', 1000, 'signup')
    `;
    const wagerId = await insertWagerRaw(sql, {
      userId,
      canonicalGameId: "football-data-900004",
      routeId: "football-data-900004-real-madrid",
      stake: 50,
    });

    await expect(
      sql`
        insert into credit_entries (user_id, kind, amount, reason, wager_id)
        values (${userId}, 'stake', -50, 'wager placed', ${randomUUID()})
      `,
    ).rejects.toMatchObject({ code: "23503" });

    await sql`
      insert into credit_entries (user_id, kind, amount, reason, wager_id)
      values (${userId}, 'return', 120, 'wager settled', ${wagerId})
    `;
    await expect(
      sql`
        insert into credit_entries (user_id, kind, amount, reason, wager_id)
        values (${userId}, 'return', 0, 'wager settled', ${wagerId})
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("keeps a wager fully readable after its game snapshot and game row are deleted", async () => {
    await seedTeams();
    const userId = await createUser(`wager-orphan-${randomUUID()}@example.com`);
    const [team] = await sql<{ id: string }[]>`
      select id from teams where slug = 'real-madrid'
    `;
    const [game] = await sql<{ id: string }[]>`
      insert into games (
        canonical_id, sport, provider, external_id, summary, scheduled_at,
        source_observed_at, fetched_at, expires_at, payload_hash
      ) values (
        'football-data-900005', 'soccer', 'football-data', '900005', '{}',
        now() + interval '1 day', now(), now(), now(), 'orphan-hash'
      ) returning id
    `;
    await sql`
      insert into game_snapshots (
        route_id, game_id, team_id, snapshot, source_observed_at,
        fetched_at, expires_at, payload_hash
      ) values (
        'football-data-900005-real-madrid', ${game!.id}, ${team!.id}, '{}',
        now(), now(), now(), 'orphan-snapshot-hash'
      )
    `;
    const wagerId = await insertWagerRaw(sql, {
      userId,
      canonicalGameId: "football-data-900005",
      routeId: "football-data-900005-real-madrid",
      stake: 50,
    });

    await sql`delete from game_snapshots where game_id = ${game!.id}`;
    await sql`delete from games where id = ${game!.id}`;

    const [row] = await sql<{ matchup: string; competition: string }[]>`
      select matchup, competition from wagers where id = ${wagerId}
    `;
    expect(row).toEqual({
      matchup: "Barcelona at Real Madrid",
      competition: "La Liga",
    });
  });
});

describe("Phase 07 final results", () => {
  it("round-trips a result through games.summary with no schema change", async () => {
    await seedTeams();
    const summary = {
      id: "football-data-700001-real-madrid",
      sport: "soccer",
      status: "finished",
      result: {
        homeScore: 0,
        awayScore: 0,
        completion: "regulation",
        source: "football-data",
        observedAt: "2026-08-16T22:00:00Z",
      },
    };
    // The upsert a refresh performs when a game moves from upcoming to
    // finished: same canonical ID, summary replaced in place.
    for (const value of [
      { ...summary, status: "scheduled", result: undefined },
      summary,
    ]) {
      await sql`
        insert into games (
          canonical_id, sport, provider, external_id, summary, scheduled_at,
          source_observed_at, fetched_at, expires_at, payload_hash
        ) values (
          'football-data-700001', 'soccer', 'football-data', '700001',
          ${JSON.stringify(value)}::jsonb,
          '2026-08-16T19:00:00Z', now(), now(), now(), 'result-hash'
        )
        on conflict (canonical_id) do update set summary = excluded.summary
      `;
    }

    // Session 09 grades from the canonical ID, not a team-perspective route ID.
    const [row] = await sql<{ summary: typeof summary }[]>`
      select summary from games where canonical_id = 'football-data-700001'
    `;
    expect(row!.summary.result).toEqual(summary.result);
    // A goalless draw survives the round trip as reported zeros, not as null.
    expect(row!.summary.result.homeScore).toBe(0);
  });
});

/**
 * Settlement reuses ingestion_runs for the lease/run record (provider
 * "settlement") and credit_entries as the settlement record itself — the
 * single `return` row IS the settlement, guarded by
 * credit_entries_wager_return_uidx. No settlements table.
 */
describe("Session 09 settlement", () => {
  it("applies the credit_entries.outcome and settlement_run_id migration", async () => {
    const columns = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'credit_entries'
    `;
    const names = columns.map((column) => column.column_name);
    expect(names).toEqual(
      expect.arrayContaining(["outcome", "settlement_run_id"]),
    );
  });

  it("allows only one active settlement lease at a time", async () => {
    await sql`
      insert into ingestion_runs (
        provider, operation, scope, status, request_id
      ) values ('settlement', 'settle', 'all', 'running', 'settle-one')
    `;
    await expect(
      sql`
        insert into ingestion_runs (
          provider, operation, scope, status, request_id
        ) values ('settlement', 'settle', 'all', 'running', 'settle-two')
      `,
    ).rejects.toMatchObject({ code: "23505" });

    await sql`
      update ingestion_runs
      set status = 'succeeded', completed_at = now()
      where request_id = 'settle-one'
    `;
    await expect(
      sql`
        insert into ingestion_runs (
          provider, operation, scope, status, request_id
        ) values ('settlement', 'settle', 'all', 'running', 'settle-two')
      `,
    ).resolves.toBeDefined();
  });

  it("two concurrent lease claims leave only one winner", async () => {
    // A distinct scope from the test above: that test leaves its own
    // ('settlement', 'settle', 'all') lease row running, which would
    // otherwise block every claim here before the race even starts.
    const results = await Promise.allSettled(
      Array.from(
        { length: 8 },
        () => sql`
          insert into ingestion_runs (
            provider, operation, scope, status, request_id
          ) values (
            'settlement', 'settle', 'concurrent-claims', 'running', 'settle-concurrent'
          )
        `,
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
  });

  it("leaves exactly one settlement row and one credit under concurrent inserts for the same wager", async () => {
    const userId = await createUser(
      `settle-concurrent-wager-${randomUUID()}@example.com`,
    );
    await sql`
      insert into credit_entries (user_id, kind, amount, reason)
      values (${userId}, 'grant', 1000, 'signup')
    `;
    const wagerId = await insertWagerRaw(sql, {
      userId,
      canonicalGameId: "football-data-910001",
      routeId: "football-data-910001-real-madrid",
      stake: 50,
    });
    await sql`
      insert into credit_entries (user_id, kind, amount, reason, wager_id)
      values (${userId}, 'stake', -50, 'wager placed', ${wagerId})
    `;

    const results = await Promise.allSettled(
      Array.from(
        { length: 5 },
        () => sql`
          insert into credit_entries (
            user_id, kind, amount, reason, wager_id, outcome
          ) values (${userId}, 'return', 120, 'wager settled', ${wagerId}, 'won')
        `,
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);

    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from credit_entries
      where wager_id = ${wagerId} and kind = 'return'
    `;
    expect(count).toBe(1);
    const [{ balance }] = await sql<{ balance: number }[]>`
      select coalesce(sum(amount), 0)::int as balance from credit_entries
      where user_id = ${userId}
    `;
    expect(balance).toBe(1000 - 50 + 120);
  });

  it("running the whole settlement twice moves the balance exactly once", async () => {
    const userId = await createUser(`settle-twice-${randomUUID()}@example.com`);
    await sql`
      insert into credit_entries (user_id, kind, amount, reason)
      values (${userId}, 'grant', 1000, 'signup')
    `;
    const wagerId = await insertWagerRaw(sql, {
      userId,
      canonicalGameId: "football-data-910002",
      routeId: "football-data-910002-real-madrid",
      stake: 50,
    });
    await sql`
      insert into credit_entries (user_id, kind, amount, reason, wager_id)
      values (${userId}, 'stake', -50, 'wager placed', ${wagerId})
    `;

    // The exact statement settleWagers issues: INSERT ... ON CONFLICT DO
    // NOTHING against credit_entries_wager_return_uidx.
    async function runSettlementOnce() {
      await sql`
        insert into credit_entries (
          user_id, kind, amount, reason, wager_id, outcome
        ) values (${userId}, 'return', 120, 'wager settled', ${wagerId}, 'won')
        on conflict (wager_id) where kind = 'return' do nothing
      `;
    }

    await runSettlementOnce();
    await runSettlementOnce();

    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from credit_entries
      where wager_id = ${wagerId} and kind = 'return'
    `;
    expect(count).toBe(1);
    const [{ balance }] = await sql<{ balance: number }[]>`
      select coalesce(sum(amount), 0)::int as balance from credit_entries
      where user_id = ${userId}
    `;
    expect(balance).toBe(1000 - 50 + 120);
  });

  it("a void settlement returns exactly the stake, never more or less", async () => {
    const userId = await createUser(`settle-void-${randomUUID()}@example.com`);
    await sql`
      insert into credit_entries (user_id, kind, amount, reason)
      values (${userId}, 'grant', 1000, 'signup')
    `;
    const wagerId = await insertWagerRaw(sql, {
      userId,
      canonicalGameId: "football-data-910003",
      routeId: "football-data-910003-real-madrid",
      stake: 50,
    });
    await sql`
      insert into credit_entries (user_id, kind, amount, reason, wager_id)
      values (${userId}, 'stake', -50, 'wager placed', ${wagerId})
    `;
    await sql`
      insert into credit_entries (
        user_id, kind, amount, reason, wager_id, outcome
      ) values (${userId}, 'return', 50, 'wager settled', ${wagerId}, 'void')
    `;
    const [{ balance }] = await sql<{ balance: number }[]>`
      select coalesce(sum(amount), 0)::int as balance from credit_entries
      where user_id = ${userId}
    `;
    expect(balance).toBe(1000);
  });

  it("enforces the credit_entries.settlement_run_id FK and traces a settled row back to its run", async () => {
    const userId = await createUser(`settle-fk-${randomUUID()}@example.com`);
    await sql`
      insert into credit_entries (user_id, kind, amount, reason)
      values (${userId}, 'grant', 1000, 'signup')
    `;
    const wagerId = await insertWagerRaw(sql, {
      userId,
      canonicalGameId: "football-data-910004",
      routeId: "football-data-910004-real-madrid",
      stake: 50,
    });
    const [run] = await sql<{ id: string }[]>`
      insert into ingestion_runs (
        provider, operation, scope, status, request_id
      ) values ('settlement', 'settle', 'all', 'succeeded', 'settle-fk')
      returning id
    `;

    await expect(
      sql`
        insert into credit_entries (
          user_id, kind, amount, reason, wager_id, outcome, settlement_run_id
        ) values (
          ${userId}, 'return', 120, 'wager settled', ${wagerId}, 'won', ${randomUUID()}
        )
      `,
    ).rejects.toMatchObject({ code: "23503" });

    await sql`
      insert into credit_entries (
        user_id, kind, amount, reason, wager_id, outcome, settlement_run_id
      ) values (
        ${userId}, 'return', 120, 'wager settled', ${wagerId}, 'won', ${run!.id}
      )
    `;
    const [row] = await sql<{ settlement_run_id: string }[]>`
      select settlement_run_id from credit_entries where wager_id = ${wagerId}
    `;
    expect(row!.settlement_run_id).toBe(run!.id);
  });

  it("leaves outcome and settlement_run_id null on every non-return kind", async () => {
    const userId = await createUser(`settle-null-${randomUUID()}@example.com`);
    await sql`
      insert into credit_entries (user_id, kind, amount, reason)
      values (${userId}, 'grant', 1000, 'signup')
    `;
    const [row] = await sql<
      { outcome: string | null; settlement_run_id: string | null }[]
    >`
      select outcome, settlement_run_id from credit_entries
      where user_id = ${userId} and kind = 'grant'
    `;
    expect(row).toEqual({ outcome: null, settlement_run_id: null });
  });
});

/**
 * Same shape as claimSlot above (session and IP quotas over rows counted for
 * the current UTC day, inside advisory locks taken in a fixed order), on the
 * next classid pair: 6 for the buddy's session quota, 7 for its IP quota —
 * the next feature after this claims 8.
 */
const BUDDY_SESSION_LIMIT = 30;
const BUDDY_IP_LIMIT = 100;

async function claimBuddyTurn(
  sessionHash: string,
  ipHash: string,
  createdAt = new Date(),
) {
  const dayStart = utcDayStart();
  return sql.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(6, hashtext(${sessionHash}))`;
    await transaction`select pg_advisory_xact_lock(7, hashtext(${ipHash}))`;
    const [session] = await transaction<{ used: number }[]>`
      select count(*)::int as used from buddy_messages
      where session_hash = ${sessionHash} and role = 'user' and created_at >= ${dayStart}
    `;
    const [ip] = await transaction<{ used: number }[]>`
      select count(*)::int as used from buddy_messages
      where ip_hash = ${ipHash} and role = 'user' and created_at >= ${dayStart}
    `;
    if (session!.used >= BUDDY_SESSION_LIMIT || ip!.used >= BUDDY_IP_LIMIT) {
      return false;
    }
    await transaction`
      insert into buddy_messages (
        conversation, session_hash, ip_hash, role, text, route, status, created_at
      ) values (
        ${randomUUID()}, ${sessionHash}, ${ipHash}, 'user', 'who do you like here?',
        'game:football-data-600002', 'ok', ${createdAt.toISOString()}
      )
    `;
    return true;
  });
}

describe("Phase E buddy turns and quotas", () => {
  it("applies the buddy_messages migration", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public'
    `;
    expect(rows.map((row) => row.table_name)).toContain("buddy_messages");
  });

  it("cannot exceed the session quota under concurrent claims", async () => {
    const sessionHash = `session-${randomUUID()}`;
    const ipHash = `ip-${randomUUID()}`;

    const results = await Promise.all(
      Array.from({ length: BUDDY_SESSION_LIMIT + 5 }, () =>
        claimBuddyTurn(sessionHash, ipHash),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(BUDDY_SESSION_LIMIT);
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from buddy_messages
      where session_hash = ${sessionHash}
    `;
    expect(count).toBe(BUDDY_SESSION_LIMIT);
  });

  it("does not count rows from a previous UTC day", async () => {
    const sessionHash = `session-${randomUUID()}`;
    const ipHash = `ip-${randomUUID()}`;
    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);

    for (let n = 0; n < BUDDY_SESSION_LIMIT; n += 1) {
      await claimBuddyTurn(sessionHash, ipHash, yesterday);
    }

    await expect(claimBuddyTurn(sessionHash, ipHash)).resolves.toBe(true);
  });

  it("stores the resolved context, never a raw route or question text column beyond `text`", async () => {
    const columns = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'buddy_messages'
    `;
    const names = columns.map((column) => column.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "conversation",
        "session_hash",
        "ip_hash",
        "route",
        "fact_ids",
        "pick_id",
        "status",
      ]),
    );
    for (const forbidden of ["ip_address", "querystring", "url"]) {
      expect(names).not.toContain(forbidden);
    }
  });
});

describe("Phase E.1 buddy notes", () => {
  it("applies the buddy_notes migration", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public'
    `;
    expect(rows.map((row) => row.table_name)).toContain("buddy_notes");
  });

  it("keys a note on session_hash, not a stored personal detail", async () => {
    const columns = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'buddy_notes'
    `;
    expect(columns.map((column) => column.column_name)).toEqual(
      expect.arrayContaining(["session_hash", "note", "created_at"]),
    );
  });

  it("can insert and read back a note for a session", async () => {
    const sessionHash = `session-${randomUUID()}`;
    await sql`
      insert into buddy_notes (session_hash, note) values (${sessionHash}, 'swears a lot, roots for Madrid')
    `;
    const rows = await sql<{ note: string }[]>`
      select note from buddy_notes where session_hash = ${sessionHash}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.note).toBe("swears a lot, roots for Madrid");
  });
});

describe("Phase G2 fixture context", () => {
  it("keeps one cache row per provider/kind/scope and overwrites in place", async () => {
    const key = ["apifootball", "standings", "laliga"] as const;
    for (const points of [70, 71]) {
      await sql`
        insert into provider_cache (provider, kind, scope, payload, fetched_at, expires_at)
        values (
          ${key[0]}, ${key[1]}, ${key[2]},
          ${JSON.stringify([{ team: "Real Madrid", points }])}::jsonb,
          now(), now() + interval '12 hours'
        )
        on conflict (provider, kind, scope) do update set
          payload = excluded.payload,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at
      `;
    }

    const rows = await sql<{ payload: { points: number }[] }[]>`
      select payload from provider_cache
      where provider = ${key[0]} and kind = ${key[1]} and scope = ${key[2]}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload[0]!.points).toBe(71);
  });

  it("holds one context row per real game and drops it with the game", async () => {
    await seedTeams();
    const canonicalId = `football-data-${randomUUID().slice(0, 8)}`;
    const [game] = await sql<{ id: string }[]>`
      insert into games (
        canonical_id, sport, provider, external_id, summary,
        scheduled_at, source_observed_at, fetched_at, expires_at, payload_hash
      ) values (
        ${canonicalId}, 'soccer', 'football-data', ${canonicalId},
        ${JSON.stringify({ homeTeam: "Elche", awayTeam: "Barcelona" })}::jsonb,
        now() + interval '2 days', now(), now(), now() + interval '6 hours',
        ${`hash-${canonicalId}`}
      ) returning id
    `;

    // A Clásico is visible under both teams' routes; the context is keyed on
    // the one real game, so a second build replaces rather than duplicates.
    for (const summary of ["first pass", "second pass"]) {
      await sql`
        insert into fixture_context (game_id, facts, summary, built_at)
        values (${game!.id}, ${JSON.stringify([{ id: "a" }])}::jsonb, ${summary}, now())
        on conflict (game_id) do update set
          facts = excluded.facts,
          summary = excluded.summary,
          built_at = excluded.built_at
      `;
    }

    const built = await sql<{ summary: string }[]>`
      select summary from fixture_context where game_id = ${game!.id}
    `;
    expect(built).toHaveLength(1);
    expect(built[0]!.summary).toBe("second pass");

    await sql`delete from games where id = ${game!.id}`;
    const orphans = await sql`
      select 1 from fixture_context where game_id = ${game!.id}
    `;
    expect(orphans).toHaveLength(0);
  });
});
