/**
 * Local settlement acceptance for T09.
 *   node --experimental-strip-types scripts/verify/settlement-scenario.ts
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function d1(command: string) {
  const stdout = execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--env",
      "preview",
      "--json",
      "--command",
      command,
    ],
    { cwd: root, encoding: "utf8" },
  );
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  const parsed = JSON.parse(stdout.slice(start, end + 1));
  return parsed[0]?.results ?? [];
}

function sqlString(value: string) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function loadSettle() {
  const { register } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const { getPlatformProxy } = await import("wrangler");
  await register(
    pathToFileURL(resolve(root, "scripts/verify/cloudflare-workers-hook.mjs"))
      .href,
    { parentURL: import.meta.url },
  );
  const proxy = await getPlatformProxy({
    configPath: resolve(root, "wrangler.jsonc"),
    environment: "preview",
    remoteBindings: false,
  });
  globalThis.__MP_CF_ENV = proxy.env;
  const loaded = await import(
    pathToFileURL(resolve(root, "src/lib/server/data/settlement.ts")).href
  );
  return { settleWagers: loaded.settleWagers, dispose: () => proxy.dispose() };
}

function ledgerInvariants() {
  const sql = readFileSync(
    resolve(root, "scripts/verify/ledger-invariants.sql"),
    "utf8",
  );
  for (const statement of sql
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)) {
    const rows = d1(statement);
    if (rows.length > 0) {
      console.error("LEDGER VIOLATIONS", rows);
      process.exit(1);
    }
  }
  console.log("LEDGER INVARIANTS OK");
}

async function main() {
  const now = Date.now();
  const kickoff = Date.parse("2026-01-01T18:00:00.000Z");
  const userId = randomUUID();
  const finishedCanonical = `t09-finished-${userId.slice(0, 8)}`;
  const cancelledCanonical = `t09-cancelled-${userId.slice(0, 8)}`;
  const liveCanonical = `t09-live-${userId.slice(0, 8)}`;
  const finishedSummary = JSON.stringify({
    id: "t09-finished-route",
    sport: "baseball",
    teamSlug: "new-york-yankees",
    competition: "MLB",
    homeTeam: "Yankees",
    awayTeam: "Red Sox",
    scheduledAt: "2026-01-01T18:00:00.000Z",
    status: "finished",
    result: {
      homeScore: 5,
      awayScore: 2,
      source: "t09-seed",
      observedAt: "2026-01-01T20:00:00.000Z",
    },
  });
  const cancelledSummary = JSON.stringify({
    id: "t09-cancelled-route",
    sport: "baseball",
    teamSlug: "new-york-yankees",
    competition: "MLB",
    homeTeam: "Yankees",
    awayTeam: "Red Sox",
    scheduledAt: "2026-01-01T18:00:00.000Z",
    status: "cancelled",
  });
  const liveSummary = JSON.stringify({
    id: "t09-live-route",
    sport: "baseball",
    teamSlug: "new-york-yankees",
    competition: "MLB",
    homeTeam: "Yankees",
    awayTeam: "Red Sox",
    scheduledAt: "2026-01-01T18:00:00.000Z",
    status: "live",
    result: {
      homeScore: 1,
      awayScore: 0,
      source: "t09-seed",
      observedAt: "2026-01-01T19:00:00.000Z",
    },
  });

  d1(`
    insert into user (id, name, email, email_verified, created_at, updated_at)
    values (${sqlString(userId)}, 'T09', ${sqlString(`t09-${userId}@example.test`)}, 1, ${now}, ${now})
  `);

  for (const [canonical, summary, external] of [
    [finishedCanonical, finishedSummary, `${finishedCanonical}-ext`],
    [cancelledCanonical, cancelledSummary, `${cancelledCanonical}-ext`],
    [liveCanonical, liveSummary, `${liveCanonical}-ext`],
  ] as const) {
    d1(`
      insert into games (
        id, canonical_id, sport, provider, external_id, summary, scheduled_at,
        source_observed_at, fetched_at, expires_at, payload_hash, created_at, updated_at
      ) values (
        ${sqlString(randomUUID())}, ${sqlString(canonical)}, 'baseball', 'mlb-stats',
        ${sqlString(external)}, ${sqlString(summary)}, ${kickoff},
        ${now}, ${now}, ${now}, 't09', ${now}, ${now}
      )
    `);
  }

  const stake = 10;
  const potentialReturn = 19;
  const price = 185;
  const versions = "'2026-09-21'";

  for (const [wagerId, canonical, selectionId, label] of [
    [randomUUID(), finishedCanonical, "home", "Home"],
    [randomUUID(), finishedCanonical, "away", "Away"],
    [randomUUID(), cancelledCanonical, "home", "Home"],
    [randomUUID(), liveCanonical, "home", "Home"],
  ] as const) {
    d1(`
      insert into wagers (
        id, user_id, canonical_game_id, route_id, sport, market_id, selection_id,
        market_label, selection_label, price_hundredths, stake, potential_return,
        matchup, competition, scheduled_at, prices_version, rules_version, created_at
      ) values (
        ${sqlString(wagerId)}, ${sqlString(userId)}, ${sqlString(canonical)}, 't09-route',
        'baseball', 'baseball-moneyline', ${sqlString(selectionId)}, 'Moneyline', ${sqlString(label)},
        ${price}, ${stake}, ${potentialReturn},
        'Red Sox at Yankees', 'MLB', ${kickoff}, ${versions}, ${versions}, ${now}
      )
    `);
    d1(`
      insert into credit_entries (id, user_id, kind, amount, reason, wager_id, created_at)
      values (${sqlString(randomUUID())}, ${sqlString(userId)}, 'stake', ${-stake}, 'wager placed', ${sqlString(wagerId)}, ${now})
    `);
  }

  console.log(
    "SEED SQL: user + 3 games (finished/cancelled/live) + 4 wagers with stakes",
  );

  const { settleWagers, dispose } = await loadSettle();
  try {
    const run1 = await settleWagers({ requestId: randomUUID() });
    console.log("SETTLE RUN 1", JSON.stringify(run1));
    const run2 = await settleWagers({ requestId: randomUUID() });
    console.log("SETTLE RUN 2", JSON.stringify(run2));

    const returns = d1(`
      select w.id as wager_id, c.amount, c.outcome, w.potential_return, w.stake
      from wagers w
      join credit_entries c on c.wager_id = w.id and c.kind = 'return'
      order by w.id
    `);
    console.log("RETURN ROWS", JSON.stringify(returns));

    const openLive = d1(`
      select count(*) as open from wagers w
      left join credit_entries c on c.wager_id = w.id and c.kind = 'return'
      where w.canonical_game_id = ${sqlString(liveCanonical)} and c.id is null
    `);
    if (Number(openLive[0]?.open) !== 1) {
      console.error("live wager should stay open", openLive);
      process.exit(1);
    }

    if (returns.length !== 3) {
      console.error("expected 3 return rows", returns);
      process.exit(1);
    }

    const amounts = returns.map((row: { amount: number }) => row.amount).sort();
    if (JSON.stringify(amounts) !== JSON.stringify([0, 10, 19])) {
      console.error("unexpected return amounts", amounts);
      process.exit(1);
    }

    if (run1.ok && run1.settled === 3 && run2.ok && run2.settled === 0) {
      console.log("SETTLEMENT SCENARIO OK");
    } else {
      console.error("unexpected settlement counts", { run1, run2 });
      process.exit(1);
    }
  } finally {
    await dispose();
  }

  ledgerInvariants();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
