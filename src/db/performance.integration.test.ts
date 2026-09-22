import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";

let container: StartedPostgreSqlContainer;
let sql: Sql;
beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  sql = postgres(container.getConnectionUri());
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  await sql`insert into users (id, name) select md5('user-' || n)::uuid, 'User ' || n from generate_series(0,999) n`;
  await sql`insert into groups (id, name, slug, created_by_user_id) select md5('group-' || n)::uuid, 'Group ' || n, 'group-' || n, md5('user-' || n)::uuid from generate_series(0,99) n`;
  await sql`insert into wagers (id, user_id, group_id, canonical_game_id, route_id, sport, market_id, selection_id, market_label, selection_label, price, stake, potential_return, matchup, competition, scheduled_at, prices_version, rules_version)
    select md5('wager-' || n)::uuid, md5('user-' || (n % 1000))::uuid, md5('group-' || (n % 100))::uuid, 'game-' || (n / 1000), 'route-' || (n / 1000), 'soccer', 'result', 'home', 'Result', 'Home', 2.4, 10, 24, 'Home v Away', 'Test', now(), '1', '1' from generate_series(0,99999) n`;
  await sql`insert into credit_entries (user_id, wager_id, kind, amount, reason) select user_id, id, 'stake', -10, 'placed' from wagers`;
  await sql`insert into credit_entries (user_id, wager_id, kind, amount, reason, outcome) select user_id, id, 'return', 24, 'settled', 'won' from wagers`;
  await sql`analyze wagers`;
  await sql`analyze credit_entries`;
});
afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

it("uses the new indexes for match eligibility, group picks, and ledger joins", async () => {
  const cases = [
    {
      index: "wagers_user_game_group_idx",
      query:
        "select * from wagers where user_id = md5('user-42')::uuid and canonical_game_id = 'game-20'",
    },
    {
      index: "wagers_group_game_user_idx",
      query:
        "select * from wagers where group_id = md5('group-42')::uuid and canonical_game_id = 'game-20'",
    },
    {
      index: "credit_entries_wager_activity_idx",
      query:
        "select sum(amount) from credit_entries where wager_id = md5('wager-20042')::uuid and kind in ('stake', 'return')",
    },
  ];
  for (const entry of cases) {
    const result = await sql.unsafe(
      `explain (analyze, buffers, format json) ${entry.query}`,
    );
    expect(JSON.stringify(result)).toContain(entry.index);
    const plan = result[0]!["QUERY PLAN"][0];
    const indexedMs = plan["Execution Time"];
    const indexedBlocks = plan.Plan["Shared Hit Blocks"];
    await sql.begin(async (tx) => {
      await tx.unsafe(`drop index ${entry.index}`);
      const baseline = await tx.unsafe(
        `explain (analyze, buffers, format json) ${entry.query}`,
      );
      const before = baseline[0]!["QUERY PLAN"][0];
      process.stdout.write(
        JSON.stringify({
          index: entry.index,
          beforeMs: before["Execution Time"],
          afterMs: indexedMs,
          beforeBlocks: before.Plan["Shared Hit Blocks"],
          afterBlocks: indexedBlocks,
        }) + "\n",
      );
      await tx`rollback`;
    });
  }
});
