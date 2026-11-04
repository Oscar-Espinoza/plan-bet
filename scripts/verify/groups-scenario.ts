/**
 * Group membership scenario for a local preview worker.
 *
 *   node --experimental-strip-types scripts/verify/groups-scenario.ts --base http://localhost:8790
 *
 * Prints GROUPS SCENARIO OK only when every step passed.
 */
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HOUSE_PRICE = 1.85;
const STAKE = 10;

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
    index === -1 ? "http://localhost:8790" : process.argv[index + 1];
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

function seedUser(userId, email, name, token) {
  const now = Date.now();
  d1(`
    insert into user (id, name, email, email_verified, created_at, updated_at)
    values (
      ${sqlString(userId)},
      ${sqlString(name)},
      ${sqlString(email)},
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
}

function seedGame(ownerId) {
  const now = Date.now();
  const kickoff = Date.parse("2027-06-01T18:00:00.000Z");
  const suffix = ownerId.slice(0, 8);
  const teamId = randomUUID();
  const gameId = randomUUID();
  const routeId = `t10-open-${suffix}`;
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
    insert into teams (
      id, slug, sport, provider, external_id, canonical,
      source_observed_at, fetched_at, expires_at, payload_hash, created_at, updated_at
    ) values (
      ${sqlString(teamId)}, ${sqlString(`t10-team-${suffix}`)}, 'baseball', 'mlb-stats',
      ${sqlString(`t10-team-${suffix}`)}, '{}',
      ${now}, ${now}, ${now}, 't10', ${now}, ${now}
    )
  `);
  d1(`
    insert into games (
      id, canonical_id, sport, provider, external_id, summary, scheduled_at,
      source_observed_at, fetched_at, expires_at, payload_hash, created_at, updated_at
    ) values (
      ${sqlString(gameId)}, ${sqlString(`t10-game-${suffix}`)}, 'baseball', 'mlb-stats',
      ${sqlString(`t10-ext-${suffix}`)}, ${sqlString(summary)}, ${kickoff},
      ${now}, ${now}, ${now}, 't10', ${now}, ${now}
    )
  `);
  d1(`
    insert into game_snapshots (
      id, route_id, game_id, team_id, snapshot,
      source_observed_at, fetched_at, expires_at, payload_hash, created_at, updated_at
    ) values (
      ${sqlString(randomUUID())}, ${sqlString(routeId)}, ${sqlString(gameId)},
      ${sqlString(teamId)}, '{}',
      ${now}, ${now}, ${now}, 't10', ${now}, ${now}
    )
  `);
  return routeId;
}

async function request(base, method, path, cookie, body) {
  const headers = { Cookie: `better-auth.session_token=${cookie}` };
  if (body !== undefined || method !== "GET") headers.Origin = base;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload, text };
}

function memberCount(groupId, userId) {
  const [row] = d1(`
    select count(*) as n from group_members
    where group_id = ${sqlString(groupId)} and user_id = ${sqlString(userId)}
  `);
  return Number(row?.n ?? 0);
}

function inviteById(id) {
  const [row] = d1(`
    select id, token, status, email from group_invites where id = ${sqlString(id)}
  `);
  return row;
}

async function main() {
  const base = argBase();
  const secret = readDevVar("BETTER_AUTH_SECRET");
  const now = Date.now();
  const ownerId = randomUUID();
  const joinerId = randomUUID();
  const outsiderId = randomUUID();
  const ownerToken = randomUUID();
  const joinerToken = randomUUID();
  const outsiderToken = randomUUID();
  const ownerEmail = `t10-owner-${ownerId.slice(0, 8)}@example.test`;
  const joinerEmail = `t10-joiner-${joinerId.slice(0, 8)}@example.test`;
  const outsiderEmail = `t10-out-${outsiderId.slice(0, 8)}@example.test`;
  seedUser(ownerId, ownerEmail, "T10 owner", ownerToken);
  seedUser(joinerId, joinerEmail, "T10 joiner", joinerToken);
  seedUser(outsiderId, outsiderEmail, "T10 outsider", outsiderToken);
  const routeId = seedGame(ownerId);
  const ownerCookie = signSession(ownerToken, secret);
  const joinerCookie = signSession(joinerToken, secret);
  const outsiderCookie = signSession(outsiderToken, secret);

  const created = await request(base, "POST", "/api/groups", ownerCookie, {
    name: `T10 ${ownerId.slice(0, 8)}`,
  });
  const group = created.payload?.data?.group;
  const ownerRole = group
    ? d1(`
        select role from group_members
        where group_id = ${sqlString(group.id)} and user_id = ${sqlString(ownerId)}
      `)[0]?.role
    : undefined;
  if (created.status === 201 && group?.slug && ownerRole === "owner") {
    pass("a create owner is a member");
  } else {
    fail(
      "a create",
      `status ${created.status} role ${ownerRole} body ${JSON.stringify(created.payload)}`,
    );
    throw new Error("create failed");
  }

  const [linkA, linkB] = await Promise.all([
    request(base, "POST", `/api/groups/${group.slug}/link`, ownerCookie),
    request(base, "POST", `/api/groups/${group.slug}/link`, ownerCookie),
  ]);
  const pendingLinks = d1(`
    select token from group_invites
    where group_id = ${sqlString(group.id)}
      and email is null
      and status = 'pending'
  `);
  if (
    linkA.status === 201 &&
    linkB.status === 201 &&
    linkA.payload?.data?.url &&
    linkA.payload.data.url === linkB.payload?.data?.url &&
    pendingLinks.length === 1
  ) {
    pass("b one pending link");
  } else {
    fail(
      "b link",
      `statuses ${linkA.status}/${linkB.status} urls ${linkA.payload?.data?.url} ${linkB.payload?.data?.url} rows ${pendingLinks.length} bodies ${JSON.stringify(linkA.payload)} ${JSON.stringify(linkB.payload)}`,
    );
  }

  const linkUrl = linkA.payload?.data?.url ?? "";
  const linkToken = linkUrl.split("/").pop() ?? "";
  const beforeGet = memberCount(group.id, joinerId);
  const preview = await request(
    base,
    "GET",
    `/groups/accept/${linkToken}`,
    joinerCookie,
  );
  const afterGet = memberCount(group.id, joinerId);
  if (
    preview.status === 200 &&
    beforeGet === 0 &&
    afterGet === 0 &&
    preview.text.includes("Join")
  ) {
    pass("h accept page does not join");
  } else {
    fail(
      "h get accept",
      `status ${preview.status} members ${beforeGet}->${afterGet}`,
    );
  }

  const outsiderPage = await request(
    base,
    "GET",
    `/groups/${group.slug}`,
    outsiderCookie,
  );
  const outsiderPatch = await request(
    base,
    "PATCH",
    `/api/groups/${group.slug}/notifications`,
    outsiderCookie,
    { notifyOnActivity: false },
  );
  if (outsiderPage.status === 404 && outsiderPatch.status === 404) {
    pass("f non-member 404");
  } else {
    fail(
      "f non-member",
      `page ${outsiderPage.status} patch ${outsiderPatch.status} ${JSON.stringify(outsiderPatch.payload)}`,
    );
  }

  const mismatchInvite = await request(
    base,
    "POST",
    `/api/groups/${group.slug}/invite`,
    ownerCookie,
    { email: `other-${ownerId.slice(0, 8)}@example.test` },
  );
  const mismatchRow = inviteById(mismatchInvite.payload?.data?.invite?.id);
  const mismatch = mismatchRow
    ? await request(base, "POST", "/api/groups/accept", joinerCookie, {
        token: mismatchRow.token,
      })
    : { status: 0, payload: null };
  const mismatchAfter = mismatchRow ? inviteById(mismatchRow.id) : undefined;
  if (
    mismatch.status === 403 &&
    mismatch.payload?.error?.message?.includes("different email") &&
    mismatchAfter?.status === "pending" &&
    memberCount(group.id, joinerId) === 0
  ) {
    pass("e email mismatch");
  } else {
    fail(
      "e mismatch",
      `status ${mismatch.status} invite ${mismatchAfter?.status} members ${memberCount(group.id, joinerId)} body ${JSON.stringify(mismatch.payload)}`,
    );
  }

  const expiredInvite = await request(
    base,
    "POST",
    `/api/groups/${group.slug}/invite`,
    ownerCookie,
    { email: joinerEmail },
  );
  const expiredId = expiredInvite.payload?.data?.invite?.id;
  if (expiredId) {
    d1(`
      update group_invites set expires_at = ${now - 60_000}
      where id = ${sqlString(expiredId)}
    `);
  }
  const expiredRow = inviteById(expiredId);
  const expired = expiredRow
    ? await request(base, "POST", "/api/groups/accept", joinerCookie, {
        token: expiredRow.token,
      })
    : { status: 0, payload: null };
  const expiredAfter = expiredRow ? inviteById(expiredRow.id) : undefined;
  if (
    expired.status === 404 &&
    expired.payload?.error?.message?.includes("expired") &&
    expiredAfter?.status === "expired" &&
    memberCount(group.id, joinerId) === 0
  ) {
    pass("d expired invite");
  } else {
    fail(
      "d expired",
      `status ${expired.status} invite ${expiredAfter?.status} body ${JSON.stringify(expired.payload)}`,
    );
  }

  const raceInvite = await request(
    base,
    "POST",
    `/api/groups/${group.slug}/invite`,
    ownerCookie,
    { email: joinerEmail },
  );
  const raceRow = inviteById(raceInvite.payload?.data?.invite?.id);
  if (!raceRow) {
    fail(
      "c race",
      `invite was not created ${JSON.stringify(raceInvite.payload)}`,
    );
  } else {
    const [accepted, revoked] = await Promise.all([
      request(base, "POST", "/api/groups/accept", joinerCookie, {
        token: raceRow.token,
      }),
      request(
        base,
        "DELETE",
        `/api/groups/${group.slug}/invites/${raceRow.id}`,
        ownerCookie,
      ),
    ]);
    const after = inviteById(raceRow.id);
    const members = memberCount(group.id, joinerId);
    const acceptWon = after?.status === "accepted";
    const revokeWon = after?.status === "revoked";
    if (
      acceptWon !== revokeWon &&
      (members === 1) === acceptWon &&
      (accepted.status === 200) === acceptWon
    ) {
      pass("c accept or revoke wins");
    } else {
      fail(
        "c race",
        `status ${after?.status} members ${members} accept ${accepted.status} revoke ${revoked.status} bodies ${JSON.stringify(accepted.payload)} ${JSON.stringify(revoked.payload)}`,
      );
    }
    if (!acceptWon) {
      const joined = await request(
        base,
        "POST",
        "/api/groups/accept",
        joinerCookie,
        {
          token: linkToken,
        },
      );
      if (joined.status !== 200 || memberCount(group.id, joinerId) !== 1) {
        fail(
          "g setup join",
          `status ${joined.status} members ${memberCount(group.id, joinerId)} ${JSON.stringify(joined.payload)}`,
        );
      }
    }
  }

  const placed = await request(base, "POST", "/api/bets", joinerCookie, {
    routeId,
    marketId: "baseball-moneyline",
    selectionId: "home",
    price: HOUSE_PRICE,
    stake: STAKE,
    groupId: group.id,
    idempotencyKey: randomUUID(),
  });
  const placedGroup = placed.payload?.data?.wager?.groupId;
  if (placed.status === 201 && placedGroup === group.id) {
    pass("g member places group wager");
  } else {
    fail(
      "g place",
      `status ${placed.status} body ${JSON.stringify(placed.payload)}`,
    );
  }

  d1(`
    delete from group_members
    where group_id = ${sqlString(group.id)} and user_id = ${sqlString(joinerId)}
  `);
  const removed = await request(base, "POST", "/api/bets", joinerCookie, {
    routeId,
    marketId: "baseball-moneyline",
    selectionId: "home",
    price: HOUSE_PRICE,
    stake: STAKE,
    groupId: group.id,
    idempotencyKey: randomUUID(),
  });
  const outsiderBet = await request(base, "POST", "/api/bets", outsiderCookie, {
    routeId,
    marketId: "baseball-moneyline",
    selectionId: "home",
    price: HOUSE_PRICE,
    stake: STAKE,
    groupId: group.id,
    idempotencyKey: randomUUID(),
  });
  if (
    removed.status === 403 &&
    outsiderBet.status === 403 &&
    String(removed.payload?.error?.message ?? "").includes("not a member") &&
    String(outsiderBet.payload?.error?.message ?? "").includes("not a member")
  ) {
    pass("g removed and non-member cannot place");
  } else {
    fail(
      "g refused",
      `removed ${removed.status} ${JSON.stringify(removed.payload)} outsider ${outsiderBet.status} ${JSON.stringify(outsiderBet.payload)}`,
    );
  }

  if (failures.length === 0) {
    console.log("GROUPS SCENARIO OK");
    return;
  }
  console.error(`GROUPS SCENARIO FAILED ${failures.length}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
