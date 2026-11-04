/**
 * Fixture comments and votes scenario for a local preview worker.
 *
 *   node --experimental-strip-types scripts/verify/comments-scenario.ts --base http://localhost:8780
 *
 * Prints COMMENTS SCENARIO OK only when every step passed.
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
    index === -1 ? "http://localhost:8780" : process.argv[index + 1];
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

function seedGame(routeId, canonicalId) {
  const now = Date.now();
  const kickoff = Date.parse("2027-06-01T18:00:00.000Z");
  const teamId = randomUUID();
  const gameId = randomUUID();
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
      ${sqlString(teamId)}, ${sqlString(`t11-team-${routeId}`)}, 'baseball', 'mlb-stats',
      ${sqlString(`t11-team-${routeId}`)}, '{}',
      ${now}, ${now}, ${now}, 't11', ${now}, ${now}
    )
  `);
  d1(`
    insert into games (
      id, canonical_id, sport, provider, external_id, summary, scheduled_at,
      source_observed_at, fetched_at, expires_at, payload_hash, created_at, updated_at
    ) values (
      ${sqlString(gameId)}, ${sqlString(canonicalId)}, 'baseball', 'mlb-stats',
      ${sqlString(`t11-ext-${routeId}`)}, ${sqlString(summary)}, ${kickoff},
      ${now}, ${now}, ${now}, 't11', ${now}, ${now}
    )
  `);
  d1(`
    insert into game_snapshots (
      id, route_id, game_id, team_id, snapshot,
      source_observed_at, fetched_at, expires_at, payload_hash, created_at, updated_at
    ) values (
      ${sqlString(randomUUID())}, ${sqlString(routeId)}, ${sqlString(gameId)},
      ${sqlString(teamId)}, '{}',
      ${now}, ${now}, ${now}, 't11', ${now}, ${now}
    )
  `);
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

function commentCount(groupId, canonicalId) {
  const [row] = d1(`
    select count(*) as n from game_comments
    where group_id = ${sqlString(groupId)}
      and canonical_game_id = ${sqlString(canonicalId)}
  `);
  return Number(row?.n ?? 0);
}

function voteCount(commentId, kind) {
  const [row] = d1(`
    select count(*) as n from comment_votes
    where comment_id = ${sqlString(commentId)} and kind = ${sqlString(kind)}
  `);
  return Number(row?.n ?? 0);
}

function placeBody(routeId, selectionId, groupId) {
  return {
    routeId,
    marketId: MARKET_ID,
    selectionId,
    price: HOUSE_PRICE,
    stake: STAKE,
    groupId,
    idempotencyKey: randomUUID(),
  };
}

async function main() {
  const base = argBase();
  const secret = readDevVar("BETTER_AUTH_SECRET");
  const suffix = randomUUID().slice(0, 8);
  const routeId = `t11-open-${suffix}`;
  const canonicalId = `t11-game-${suffix}`;
  const memberA = randomUUID();
  const memberB = randomUUID();
  const outsider = randomUUID();
  const tokenA = randomUUID();
  const tokenB = randomUUID();
  const tokenOut = randomUUID();
  const groupId = randomUUID();
  const groupSlug = `t11-${suffix}`;

  seedUser(memberA, `t11-a-${suffix}@example.test`, "Member A", tokenA);
  seedUser(memberB, `t11-b-${suffix}@example.test`, "Member B", tokenB);
  seedUser(outsider, `t11-out-${suffix}@example.test`, "Outsider", tokenOut);
  seedGame(routeId, canonicalId);

  const now = Date.now();
  d1(`
    insert into groups (id, name, slug, created_by_user_id, created_at)
    values (
      ${sqlString(groupId)}, 'T11 group', ${sqlString(groupSlug)},
      ${sqlString(memberA)}, ${now}
    )
  `);
  for (const [userId, role] of [
    [memberA, "owner"],
    [memberB, "member"],
  ]) {
    d1(`
      insert into group_members (group_id, user_id, role, notify_on_activity, joined_at)
      values (${sqlString(groupId)}, ${sqlString(userId)}, ${sqlString(role)}, 1, ${now})
    `);
  }

  const cookieA = signSession(tokenA, secret);
  const cookieB = signSession(tokenB, secret);
  const cookieOut = signSession(tokenOut, secret);

  const betA = await request(
    base,
    "POST",
    "/api/bets",
    cookieA,
    placeBody(routeId, "home", groupId),
  );
  const betB = await request(
    base,
    "POST",
    "/api/bets",
    cookieB,
    placeBody(routeId, "away", groupId),
  );
  if (betA.status !== 201 || betB.status !== 201) {
    fail("setup bets", `${betA.status} ${betB.status}`);
    throw new Error("setup failed");
  }

  const first = await request(
    base,
    "POST",
    `/api/games/${routeId}/comments`,
    cookieA,
    {
      groupId,
      body: "Before kickoff take",
    },
  );
  const afterFirst = commentCount(groupId, canonicalId);
  if (
    first.status === 201 &&
    first.payload?.data?.comment?.body === "Before kickoff take" &&
    afterFirst === 1
  ) {
    pass("a member posts before kickoff");
  } else {
    fail(
      "a before comment",
      `status ${first.status} count ${afterFirst} ${JSON.stringify(first.payload)}`,
    );
  }

  const beforeDup = commentCount(groupId, canonicalId);
  const dup = await request(
    base,
    "POST",
    `/api/games/${routeId}/comments`,
    cookieA,
    {
      groupId,
      body: "Second before message",
    },
  );
  const afterDup = commentCount(groupId, canonicalId);
  if (
    dup.status === 400 &&
    dup.payload?.error?.code === "invalid_request" &&
    beforeDup === afterDup &&
    afterDup === 1
  ) {
    pass("b duplicate before comment refused");
  } else {
    fail(
      "b duplicate",
      `status ${dup.status} counts ${beforeDup}->${afterDup} ${JSON.stringify(dup.payload)}`,
    );
  }

  const outsiderPage = await request(
    base,
    "GET",
    `/games/${routeId}`,
    cookieOut,
  );
  const outsiderPost = await request(
    base,
    "POST",
    `/api/games/${routeId}/comments`,
    cookieOut,
    { groupId, body: "Outsider post" },
  );
  const outsiderVote = await request(
    base,
    "POST",
    `/api/comments/${first.payload?.data?.comment?.id}/votes`,
    cookieOut,
    { kind: "shame" },
  );
  const outsiderComments = commentCount(groupId, canonicalId);
  if (
    !outsiderPage.text.includes("Group discussion") &&
    outsiderPost.status === 403 &&
    outsiderPost.payload?.error?.code === "forbidden" &&
    outsiderVote.status === 403 &&
    outsiderVote.payload?.error?.code === "forbidden" &&
    outsiderComments === 1
  ) {
    pass("c non-member cannot read post or vote");
  } else {
    fail(
      "c non-member",
      `page has panel ${outsiderPage.text.includes("Group discussion")} post ${outsiderPost.status} vote ${outsiderVote.status} count ${outsiderComments}`,
    );
  }

  d1(`
    delete from group_members
    where group_id = ${sqlString(groupId)} and user_id = ${sqlString(memberB)}
  `);
  const removedPost = await request(
    base,
    "POST",
    `/api/games/${routeId}/comments`,
    cookieB,
    { groupId, body: "After removal" },
  );
  if (
    removedPost.status === 403 &&
    removedPost.payload?.error?.code === "forbidden"
  ) {
    pass("f removed member cannot post");
  } else {
    fail(
      "f removed member",
      `status ${removedPost.status} ${JSON.stringify(removedPost.payload)}`,
    );
  }

  d1(`
    insert into group_members (group_id, user_id, role, notify_on_activity, joined_at)
    values (${sqlString(groupId)}, ${sqlString(memberB)}, 'member', 1, ${now})
  `);

  const rootId = first.payload?.data?.comment?.id;
  const reply = await request(
    base,
    "POST",
    `/api/games/${routeId}/comments`,
    cookieB,
    {
      groupId,
      body: "Reply across the aisle",
      parentCommentId: rootId,
    },
  );
  const [replyRow] = d1(`
    select parent_comment_id from game_comments where id = ${sqlString(reply.payload?.data?.comment?.id ?? "")}
  `);
  if (reply.status === 201 && replyRow?.parent_comment_id === rootId) {
    pass("d reply links to parent");
  } else {
    fail(
      "d reply",
      `status ${reply.status} parent ${replyRow?.parent_comment_id} expected ${rootId}`,
    );
  }

  const commentId = rootId;
  const shame1 = await request(
    base,
    "POST",
    `/api/comments/${commentId}/votes`,
    cookieB,
    { kind: "shame" },
  );
  const slander = await request(
    base,
    "POST",
    `/api/comments/${commentId}/votes`,
    cookieB,
    { kind: "slander" },
  );
  const shameDup = await request(
    base,
    "POST",
    `/api/comments/${commentId}/votes`,
    cookieB,
    { kind: "shame" },
  );
  if (
    shame1.status === 201 &&
    slander.status === 201 &&
    shameDup.status === 400 &&
    voteCount(commentId, "shame") === 1 &&
    voteCount(commentId, "slander") === 1
  ) {
    pass("e shame and slander persist duplicate shame refused");
  } else {
    fail(
      "e votes",
      `shame ${shame1.status} slander ${slander.status} dup ${shameDup.status} counts shame ${voteCount(commentId, "shame")} slander ${voteCount(commentId, "slander")}`,
    );
  }

  if (failures.length === 0) {
    console.log("COMMENTS SCENARIO OK");
  } else {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
