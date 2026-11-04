/**
 * Placement and reset scenario for local `pnpm preview:cf`.
 * Creates its own user and session in local D1, then talks to the app over HTTP.
 *
 *   node --experimental-strip-types scripts/verify/money-scenario.ts --base http://localhost:8787
 *
 * Prints MONEY SCENARIO OK, then runs scripts/verify/ledger-invariants.sql and
 * prints LEDGER INVARIANTS OK when that query returns no rows.
 */
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HOUSE_PRICE = 1.85;
const STAKE = 10;
const MARKET_ID = "baseball-moneyline";
const SELECTION_ID = "home";

const failures = [];

function fail(step, detail) {
  const line = `${step}: ${detail}`;
  failures.push(line);
  console.error(`FAIL ${line}`);
}

function pass(step) {
  console.log(`PASS ${step}`);
}

function argBase() {
  const index = process.argv.indexOf("--base");
  const value =
    index === -1 ? "http://localhost:8787" : process.argv[index + 1];
  if (!value) throw new Error("Missing value for --base");
  return value.replace(/\/+$/, "");
}

function readDevVar(name) {
  const text = readFileSync(resolve(root, ".dev.vars"), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1).trim();
  }
  throw new Error(`${name} is missing from .dev.vars`);
}

function signSession(token, secret) {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

function d1(command) {
  let stdout = "";
  let stderr = "";
  try {
    stdout = execFileSync(
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
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    stdout = error.stdout?.toString() ?? "";
    stderr = error.stderr?.toString() ?? "";
    throw new Error(
      `D1 command failed: ${command}\n${stderr}\n${stdout}`.slice(0, 2000),
    );
  }
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error(`D1 output was not JSON: ${stdout.slice(0, 500)}`);
  }
  const parsed = JSON.parse(stdout.slice(start, end + 1));
  return parsed[0]?.results ?? [];
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function counts(userId) {
  const [row] = d1(`
    select
      (select count(*) from wagers where user_id = ${sqlString(userId)}) as wagers,
      (select count(*) from credit_entries where user_id = ${sqlString(userId)} and kind = 'stake') as stakes,
      (select count(*) from credit_entries where user_id = ${sqlString(userId)} and kind = 'reset') as resets,
      (select coalesce(sum(amount), 0) from credit_entries where user_id = ${sqlString(userId)}) as balance
  `);
  return {
    wagers: Number(row?.wagers ?? 0),
    stakes: Number(row?.stakes ?? 0),
    resets: Number(row?.resets ?? 0),
    balance: Number(row?.balance ?? 0),
  };
}

async function postJson(base, path, cookie, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      Cookie: `better-auth.session_token=${cookie}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

function placeBody(openRoute, extra) {
  return {
    routeId: openRoute,
    marketId: MARKET_ID,
    selectionId: SELECTION_ID,
    price: HOUSE_PRICE,
    stake: STAKE,
    ...extra,
  };
}

function errorMessage(payload) {
  return payload?.error?.message ?? JSON.stringify(payload);
}

function seed(
  userId,
  token,
  outsiderGroupId,
  memberGroupId,
  openRoute,
  closedRoute,
) {
  const now = Date.now();
  const kickoff = Date.parse("2027-06-01T18:00:00.000Z");
  const teamId = randomUUID();
  const openGameId = randomUUID();
  const closedGameId = randomUUID();
  const suffix = userId.slice(0, 8);
  const summary = (routeId, status) =>
    JSON.stringify({
      id: routeId,
      sport: "baseball",
      teamSlug: "new-york-yankees",
      competition: "MLB",
      homeTeam: "Yankees",
      awayTeam: "Red Sox",
      scheduledAt: "2027-06-01T18:00:00.000Z",
      status,
    });
  d1(`
    insert into user (id, name, email, email_verified, created_at, updated_at)
    values (
      ${sqlString(userId)},
      'T08a',
      ${sqlString(`t08a-${userId}@example.test`)},
      1,
      ${now},
      ${now}
    )
  `);
  d1(`
    insert into session (id, expires_at, token, created_at, updated_at, user_id)
    values (
      ${sqlString(randomUUID())},
      ${now + 7 * 24 * 60 * 60 * 1000},
      ${sqlString(token)},
      ${now},
      ${now},
      ${sqlString(userId)}
    )
  `);
  d1(`
    insert into teams (
      id, slug, sport, provider, external_id, canonical,
      source_observed_at, fetched_at, expires_at, payload_hash, created_at, updated_at
    ) values (
      ${sqlString(teamId)}, ${sqlString(`t08a-team-${suffix}`)}, 'baseball', 'mlb-stats', ${sqlString(`t08a-team-${suffix}`)}, '{}',
      ${now}, ${now}, ${now}, 't08a', ${now}, ${now}
    )
  `);
  for (const [gameId, routeId, status, externalId, canonicalId] of [
    [
      openGameId,
      openRoute,
      "scheduled",
      `t08a-open-${suffix}`,
      `t08a-game-open-${suffix}`,
    ],
    [
      closedGameId,
      closedRoute,
      "live",
      `t08a-closed-${suffix}`,
      `t08a-game-closed-${suffix}`,
    ],
  ]) {
    d1(`
      insert into games (
        id, canonical_id, sport, provider, external_id, summary, scheduled_at,
        source_observed_at, fetched_at, expires_at, payload_hash, created_at, updated_at
      ) values (
        ${sqlString(gameId)}, ${sqlString(canonicalId)}, 'baseball', 'mlb-stats',
        ${sqlString(externalId)}, ${sqlString(summary(routeId, status))}, ${kickoff},
        ${now}, ${now}, ${now}, 't08a', ${now}, ${now}
      )
    `);
    d1(`
      insert into game_snapshots (
        id, route_id, game_id, team_id, snapshot,
        source_observed_at, fetched_at, expires_at, payload_hash, created_at, updated_at
      ) values (
        ${sqlString(randomUUID())}, ${sqlString(routeId)}, ${sqlString(gameId)},
        ${sqlString(teamId)}, '{}',
        ${now}, ${now}, ${now}, 't08a', ${now}, ${now}
      )
    `);
  }
  for (const [groupId, slug, name] of [
    [outsiderGroupId, `t08a-outsiders-${suffix}`, "Outsiders"],
    [memberGroupId, `t08a-members-${suffix}`, "Members"],
  ]) {
    d1(`
      insert into groups (id, name, slug, created_by_user_id, created_at)
      values (
        ${sqlString(groupId)}, ${sqlString(name)}, ${sqlString(slug)},
        ${sqlString(userId)}, ${now}
      )
    `);
  }
  d1(`
    insert into group_members (group_id, user_id, role, notify_on_activity, joined_at)
    values (${sqlString(memberGroupId)}, ${sqlString(userId)}, 'member', 1, ${now})
  `);
}

async function main() {
  const base = argBase();
  const secret = readDevVar("BETTER_AUTH_SECRET");
  const userId = randomUUID();
  const token = randomUUID();
  const outsiderGroupId = randomUUID();
  const memberGroupId = randomUUID();
  const openRoute = `t08a-open-${userId.slice(0, 8)}`;
  const closedRoute = `t08a-closed-${userId.slice(0, 8)}`;
  const cookie = signSession(token, secret);
  seed(userId, token, outsiderGroupId, memberGroupId, openRoute, closedRoute);

  const opening = counts(userId);
  if (opening.balance !== 1000 || opening.wagers !== 0) {
    fail(
      "setup",
      `expected grant 1000 and no wagers, got ${JSON.stringify(opening)}`,
    );
    return finish(false);
  }

  const keyOne = randomUUID();
  const first = await postJson(
    base,
    "/api/bets",
    cookie,
    placeBody(openRoute, { idempotencyKey: keyOne }),
  );
  const firstWager = first.payload?.data?.wager;
  const afterFirst = counts(userId);
  if (
    first.status === 201 &&
    firstWager?.id &&
    firstWager.price === HOUSE_PRICE &&
    firstWager.stake === STAKE &&
    firstWager.potentialReturn === Math.round(STAKE * HOUSE_PRICE) &&
    firstWager.selectionLabel === "Home" &&
    firstWager.matchup === "Red Sox at Yankees" &&
    first.payload.data.summary.balance === 990 &&
    afterFirst.wagers === 1 &&
    afterFirst.stakes === 1 &&
    afterFirst.balance === 990
  ) {
    pass("1 place");
  } else {
    fail(
      "1 place",
      `status ${first.status} body ${JSON.stringify(first.payload)} counts ${JSON.stringify(afterFirst)}`,
    );
  }

  const listed = await fetch(`${base}/api/bets`, {
    headers: { Cookie: `better-auth.session_token=${cookie}` },
  });
  const listedBody = await listed.json();
  if (listed.status === 200 && listedBody.data?.[0]?.id === firstWager?.id) {
    pass("1 list");
  } else {
    fail(
      "1 list",
      `status ${listed.status} body ${JSON.stringify(listedBody)}`,
    );
  }

  const beforeReplay = counts(userId);
  const replay = await postJson(
    base,
    "/api/bets",
    cookie,
    placeBody(openRoute, { idempotencyKey: keyOne }),
  );
  const afterReplay = counts(userId);
  if (
    replay.status === 200 &&
    replay.payload?.data?.wager?.id === firstWager?.id &&
    afterReplay.wagers === beforeReplay.wagers &&
    afterReplay.stakes === beforeReplay.stakes &&
    afterReplay.balance === beforeReplay.balance
  ) {
    pass("2 replay");
  } else {
    fail(
      "2 replay",
      `status ${replay.status} body ${JSON.stringify(replay.payload)} counts ${JSON.stringify(afterReplay)}`,
    );
  }

  const keyTwo = randomUUID();
  const second = await postJson(
    base,
    "/api/bets",
    cookie,
    placeBody(openRoute, { idempotencyKey: keyTwo }),
  );
  const afterSecond = counts(userId);
  if (
    second.status === 201 &&
    second.payload?.data?.wager?.id &&
    second.payload.data.wager.id !== firstWager?.id &&
    afterSecond.wagers === 2 &&
    afterSecond.stakes === 2 &&
    afterSecond.balance === 980
  ) {
    pass("3 second key");
  } else {
    fail(
      "3 second key",
      `status ${second.status} body ${JSON.stringify(second.payload)} counts ${JSON.stringify(afterSecond)}`,
    );
  }

  const beforeOver = counts(userId);
  const over = await postJson(
    base,
    "/api/bets",
    cookie,
    placeBody(openRoute, {
      idempotencyKey: randomUUID(),
      stake: beforeOver.balance + 1,
    }),
  );
  const afterOver = counts(userId);
  if (
    over.status === 400 &&
    over.payload?.error?.code === "invalid_request" &&
    errorMessage(over.payload) === "That stake is more than your balance." &&
    afterOver.wagers === beforeOver.wagers &&
    afterOver.stakes === beforeOver.stakes &&
    afterOver.balance === beforeOver.balance
  ) {
    pass("4 overdraw");
  } else {
    fail(
      "4 overdraw",
      `status ${over.status} body ${JSON.stringify(over.payload)} counts ${JSON.stringify(afterOver)}`,
    );
  }

  const beforeClosed = counts(userId);
  const closed = await postJson(base, "/api/bets", cookie, {
    ...placeBody(openRoute, { idempotencyKey: randomUUID() }),
    routeId: closedRoute,
  });
  const afterClosed = counts(userId);
  if (
    closed.status === 403 &&
    closed.payload?.error?.code === "forbidden" &&
    errorMessage(closed.payload) ===
      "This game is already in progress. Check the games board for what's next." &&
    afterClosed.wagers === beforeClosed.wagers &&
    afterClosed.stakes === beforeClosed.stakes
  ) {
    pass("5 closed");
  } else {
    fail(
      "5 closed",
      `status ${closed.status} body ${JSON.stringify(closed.payload)}`,
    );
  }

  const beforeGroup = counts(userId);
  const outsider = await postJson(base, "/api/bets", cookie, {
    ...placeBody(openRoute, { idempotencyKey: randomUUID() }),
    groupId: outsiderGroupId,
  });
  const afterGroup = counts(userId);
  if (
    outsider.status === 403 &&
    outsider.payload?.error?.code === "forbidden" &&
    errorMessage(outsider.payload) === "You are not a member of that group." &&
    afterGroup.wagers === beforeGroup.wagers &&
    afterGroup.stakes === beforeGroup.stakes
  ) {
    pass("6 non-member");
  } else {
    fail(
      "6 non-member",
      `status ${outsider.status} body ${JSON.stringify(outsider.payload)}`,
    );
  }

  const beforePrice = counts(userId);
  const moved = await postJson(base, "/api/bets", cookie, {
    ...placeBody(openRoute, { idempotencyKey: randomUUID() }),
    price: 9.99,
  });
  const afterPrice = counts(userId);
  if (
    moved.status === 400 &&
    moved.payload?.error?.code === "invalid_request" &&
    errorMessage(moved.payload) ===
      "The price moved to 1.85. Tap the selection again to place at the new price." &&
    afterPrice.wagers === beforePrice.wagers &&
    afterPrice.stakes === beforePrice.stakes
  ) {
    pass("7 price");
  } else {
    fail(
      "7 price",
      `status ${moved.status} body ${JSON.stringify(moved.payload)}`,
    );
  }

  const beforeTotals = counts(userId);
  const totals = await postJson(base, "/api/bets", cookie, {
    routeId: openRoute,
    marketId: "baseball-total-8-5",
    selectionId: "over",
    price: 1.9,
    stake: STAKE,
    idempotencyKey: randomUUID(),
  });
  const totalsId = totals.payload?.data?.wager?.id;
  const [storedTotals] = totalsId
    ? d1(
        `select line_tenths, price_hundredths from wagers where id = ${sqlString(totalsId)}`,
      )
    : [];
  const afterTotals = counts(userId);
  if (
    totals.status === 201 &&
    totals.payload?.data?.wager?.line === 8.5 &&
    totals.payload?.data?.wager?.price === 1.9 &&
    Number(storedTotals?.line_tenths) === 85 &&
    Number(storedTotals?.price_hundredths) === 190 &&
    afterTotals.wagers === beforeTotals.wagers + 1 &&
    afterTotals.stakes === beforeTotals.stakes + 1
  ) {
    pass("totals line");
  } else {
    fail(
      "totals line",
      `status ${totals.status} body ${JSON.stringify(totals.payload)} stored ${JSON.stringify(storedTotals)}`,
    );
  }

  const beforeBurst = counts(userId);
  const burstStake = Math.max(
    1,
    Math.min(beforeBurst.balance, Math.floor(beforeBurst.balance / 10) || 1),
  );
  const burst = await Promise.all(
    Array.from({ length: 20 }, () =>
      postJson(
        base,
        "/api/bets",
        cookie,
        placeBody(openRoute, {
          idempotencyKey: randomUUID(),
          stake: burstStake,
        }),
      ),
    ),
  );
  const successes = burst.filter((item) => item.status === 201);
  const rejected = burst.filter(
    (item) =>
      item.status === 400 &&
      item.payload?.error?.message === "That stake is more than your balance.",
  );
  const afterBurst = counts(userId);
  const successIds = successes
    .map((item) => item.payload?.data?.wager?.id)
    .filter(Boolean);
  let stakeRowsOk = successIds.length === successes.length;
  if (successIds.length > 0) {
    const rows = d1(`
      select w.id as id, count(c.id) as stakes
      from wagers w
      left join credit_entries c on c.wager_id = w.id and c.kind = 'stake'
      where w.id in (${successIds.map(sqlString).join(", ")})
      group by w.id
    `);
    stakeRowsOk =
      rows.length === successIds.length &&
      rows.every((row) => Number(row.stakes) === 1);
  }
  const expectedSuccesses = Math.floor(beforeBurst.balance / burstStake);
  if (
    successes.length + rejected.length === 20 &&
    successes.length === expectedSuccesses &&
    afterBurst.balance ===
      beforeBurst.balance - expectedSuccesses * burstStake &&
    afterBurst.wagers === beforeBurst.wagers + successes.length &&
    stakeRowsOk
  ) {
    pass(
      `8 concurrent (${successes.length} placed, stake ${burstStake}, balance ${afterBurst.balance})`,
    );
  } else {
    fail(
      "8 concurrent",
      `placed ${successes.length} rejected ${rejected.length} other ${20 - successes.length - rejected.length} balance ${afterBurst.balance} before ${beforeBurst.balance} stake ${burstStake} stakeRowsOk ${stakeRowsOk} sample ${JSON.stringify(burst.find((item) => item.status !== 201 && item.status !== 400)?.payload ?? burst[0]?.payload)}`,
    );
  }

  const beforeReset = counts(userId);
  const resets = [];
  for (let index = 0; index < 6; index += 1) {
    resets.push(await postJson(base, "/api/bets/reset", cookie, {}));
  }
  const resetRows = d1(`
    select amount from credit_entries
    where user_id = ${sqlString(userId)} and kind = 'reset'
    order by created_at asc, id asc
  `);
  const resetAmounts = resetRows.map((row) => Number(row.amount));
  if (
    resets.slice(0, 5).every((item) => item.status === 200) &&
    resets[5]?.status === 429 &&
    resets[5]?.payload?.error?.code === "quota_exceeded" &&
    resetAmounts.length === 5
  ) {
    pass("9 reset cap");
  } else {
    fail(
      "9 reset cap",
      `statuses ${resets.map((item) => item.status).join(",")} amounts ${resetAmounts.join(",")} body ${JSON.stringify(resets[5]?.payload)}`,
    );
  }
  const expectedReset = [1000 - beforeReset.balance, 0, 0, 0, 0];
  if (
    multiset(resetAmounts) === multiset(expectedReset) &&
    counts(userId).resets === 5
  ) {
    pass("10 delta 0");
  } else {
    fail(
      "10 delta 0",
      `amounts ${resetAmounts.join(",")} before ${beforeReset.balance} resets ${counts(userId).resets}`,
    );
  }

  const raceKey = randomUUID();
  const race = await Promise.all([
    postJson(
      base,
      "/api/bets",
      cookie,
      placeBody(openRoute, { idempotencyKey: raceKey }),
    ),
    postJson(
      base,
      "/api/bets",
      cookie,
      placeBody(openRoute, { idempotencyKey: raceKey }),
    ),
  ]);
  const raceIds = race.map((item) => item.payload?.data?.wager?.id);
  const raceCounts = counts(userId);
  const raceStake = d1(`
    select count(*) as stakes from credit_entries
    where kind = 'stake' and wager_id = ${sqlString(raceIds[0] ?? "")}
  `);
  if (
    race.filter((item) => item.status === 201).length === 1 &&
    race.filter((item) => item.status === 200).length === 1 &&
    raceIds[0] &&
    raceIds[0] === raceIds[1] &&
    Number(raceStake[0]?.stakes) === 1
  ) {
    pass("same-key race");
  } else {
    fail(
      "same-key race",
      `statuses ${race.map((item) => item.status).join(",")} ids ${raceIds.join(",")} stakes ${raceStake[0]?.stakes} counts ${JSON.stringify(raceCounts)}`,
    );
  }

  const beforeBare = counts(userId);
  const bare = await Promise.all([
    postJson(base, "/api/bets", cookie, placeBody(openRoute, {})),
    postJson(base, "/api/bets", cookie, placeBody(openRoute, {})),
  ]);
  const afterBare = counts(userId);
  if (
    bare.every((item) => item.status === 201) &&
    afterBare.wagers === beforeBare.wagers + 2 &&
    afterBare.stakes === beforeBare.stakes + 2
  ) {
    pass("missing key");
  } else {
    fail(
      "missing key",
      `statuses ${bare.map((item) => item.status).join(",")} counts ${JSON.stringify(afterBare)}`,
    );
  }

  const beforeMember = counts(userId);
  const member = await postJson(base, "/api/bets", cookie, {
    ...placeBody(openRoute, { idempotencyKey: randomUUID() }),
    groupId: memberGroupId,
  });
  const afterMember = counts(userId);
  if (
    member.status === 201 &&
    member.payload?.data?.wager?.groupId === memberGroupId &&
    afterMember.wagers === beforeMember.wagers + 1 &&
    afterMember.stakes === beforeMember.stakes + 1
  ) {
    pass("member place");
  } else {
    fail(
      "member place",
      `status ${member.status} body ${JSON.stringify(member.payload)}`,
    );
  }

  await batchPredicates(userId, outsiderGroupId, openRoute);

  return finish(true);
}

function multiset(values) {
  return values
    .map(Number)
    .sort((left, right) => left - right)
    .join(",");
}

function placementInput(userId, routeId, canonicalGameId, extra) {
  return {
    userId,
    routeId,
    canonicalGameId,
    sport: "baseball",
    marketId: MARKET_ID,
    selectionId: SELECTION_ID,
    marketLabel: "Moneyline",
    selectionLabel: "Home",
    line: null,
    price: HOUSE_PRICE,
    stake: STAKE,
    potentialReturn: Math.round(STAKE * HOUSE_PRICE),
    matchup: "Red Sox at Yankees",
    competition: "MLB",
    scheduledAt: new Date("2027-06-01T18:00:00.000Z"),
    ...extra,
  };
}

function seedDivergedGame(routeId, canonicalId) {
  const now = Date.now();
  const summary = JSON.stringify({
    id: routeId,
    sport: "baseball",
    teamSlug: "new-york-yankees",
    competition: "MLB",
    homeTeam: "Yankees",
    awayTeam: "Red Sox",
    scheduledAt: "2027-06-01T18:00:00.000Z",
    status: "scheduled",
  });
  d1(`
    insert into games (
      id, canonical_id, sport, provider, external_id, summary, scheduled_at,
      source_observed_at, fetched_at, expires_at, payload_hash, created_at, updated_at
    ) values (
      ${sqlString(randomUUID())}, ${sqlString(canonicalId)}, 'baseball', 'mlb-stats',
      ${sqlString(canonicalId)}, ${sqlString(summary)}, ${now - 60_000},
      ${now}, ${now}, ${now}, 't08a', ${now}, ${now}
    )
  `);
}

async function loadCommitPlacement() {
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
  try {
    globalThis.__MP_CF_ENV = proxy.env;
    const loaded = await import(
      pathToFileURL(resolve(root, "src/lib/server/data/wagers.ts")).href
    );
    return {
      commitPlacement: loaded.commitPlacement,
      dispose: () => proxy.dispose(),
    };
  } catch (error) {
    await proxy.dispose();
    throw error;
  }
}

async function batchPredicates(userId, outsiderGroupId, openRoute) {
  const suffix = userId.slice(0, 8);
  const openCanonical = `t08a-game-open-${suffix}`;
  const divergedRoute = `t08a-diverged-${suffix}`;
  const divergedCanonical = `t08a-game-diverged-${suffix}`;
  seedDivergedGame(divergedRoute, divergedCanonical);

  let dispose = async () => {};
  try {
    const loaded = await loadCommitPlacement();
    dispose = loaded.dispose;
    const { commitPlacement } = loaded;

    const beforeClosed = counts(userId);
    const closed = await commitPlacement(
      placementInput(userId, divergedRoute, divergedCanonical, {
        idempotencyKey: randomUUID(),
      }),
    );
    const afterClosed = counts(userId);
    if (
      closed.ok === false &&
      closed.reason === "closed" &&
      closed.status === "started" &&
      afterClosed.wagers === beforeClosed.wagers &&
      afterClosed.stakes === beforeClosed.stakes &&
      afterClosed.balance === beforeClosed.balance
    ) {
      pass("batch closed column");
    } else {
      fail(
        "batch closed column",
        `result ${JSON.stringify(closed)} counts ${JSON.stringify(afterClosed)} before ${JSON.stringify(beforeClosed)}`,
      );
    }

    const beforeMember = counts(userId);
    const outsider = await commitPlacement(
      placementInput(userId, openRoute, openCanonical, {
        groupId: outsiderGroupId,
        idempotencyKey: randomUUID(),
      }),
    );
    const afterMember = counts(userId);
    if (
      outsider.ok === false &&
      outsider.reason === "not_a_group_member" &&
      afterMember.wagers === beforeMember.wagers &&
      afterMember.stakes === beforeMember.stakes &&
      afterMember.balance === beforeMember.balance
    ) {
      pass("batch non-member");
    } else {
      fail(
        "batch non-member",
        `result ${JSON.stringify(outsider)} counts ${JSON.stringify(afterMember)}`,
      );
    }

    const beforeKey = counts(userId);
    const key = randomUUID();
    const first = await commitPlacement(
      placementInput(userId, openRoute, openCanonical, {
        idempotencyKey: key,
      }),
    );
    const second = await commitPlacement(
      placementInput(userId, openRoute, openCanonical, {
        idempotencyKey: key,
      }),
    );
    const afterKey = counts(userId);
    if (
      first.ok === true &&
      first.replayed === false &&
      second.ok === true &&
      second.replayed === true &&
      first.wager.id === second.wager.id &&
      afterKey.wagers === beforeKey.wagers + 1 &&
      afterKey.stakes === beforeKey.stakes + 1 &&
      afterKey.balance === beforeKey.balance - STAKE
    ) {
      pass("batch same key");
    } else {
      fail(
        "batch same key",
        `first ${JSON.stringify(first)} second ${JSON.stringify(second)} counts ${JSON.stringify(afterKey)} before ${JSON.stringify(beforeKey)}`,
      );
    }
  } catch (error) {
    fail(
      "batch predicates",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await dispose();
  }
}

function ledgerViolations() {
  const file = resolve(root, "scripts/verify/ledger-invariants.sql");
  let stdout = "";
  try {
    stdout = execFileSync(
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
        "--file",
        file,
      ],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    const stderr = error.stderr?.toString() ?? "";
    const out = error.stdout?.toString() ?? "";
    throw new Error(`Ledger query failed\n${stderr}\n${out}`.slice(0, 2000));
  }
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error(`D1 output was not JSON: ${stdout.slice(0, 500)}`);
  }
  const parsed = JSON.parse(stdout.slice(start, end + 1));
  return parsed.flatMap((entry) => entry.results ?? []);
}

function finish(scenarioAttempted) {
  if (failures.length === 0 && scenarioAttempted) {
    console.log("MONEY SCENARIO OK");
    const violations = ledgerViolations();
    if (violations.length === 0) {
      console.log("LEDGER INVARIANTS OK");
      return;
    }
    for (const row of violations) {
      console.error(
        `FAIL ledger ${row.violation} ${row.entity_id} ${row.detail}`,
      );
    }
  } else {
    console.error(`${failures.length} failure(s)`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
