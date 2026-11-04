/**
 * Hand-written rows for the local T14 rehearsal. Refuses any database that is
 * not the throwaway Docker Postgres on 127.0.0.1:55432.
 *
 *   node --experimental-strip-types scripts/migrate/rehearsal-edges.ts \
 *     --url-env DATABASE_URL --env-file legacy/.env.local
 */
import postgres from "postgres";
import { arg, readEnvFile } from "./files.ts";

const NONAME = "14141414-1414-4414-8414-141414141414";
const QUOTES = "14141414-1414-4414-8414-141414141415";
const NOEMAIL = "14141414-1414-4414-8414-141414141416";
const GRANT_NONAME = "14141414-1414-4414-8414-141414141421";
const GRANT_QUOTES = "14141414-1414-4414-8414-141414141422";
const WAGER_TOTALS = "14141414-1414-4414-8414-141414141431";
const WAGER_VOID = "14141414-1414-4414-8414-141414141432";
const STAKE_TOTALS = "14141414-1414-4414-8414-141414141441";
const STAKE_VOID = "14141414-1414-4414-8414-141414141442";
const RETURN_VOID = "14141414-1414-4414-8414-141414141443";
const RESET = "14141414-1414-4414-8414-141414141444";
const INVITE_LINK = "14141414-1414-4414-8414-141414141451";
const INVITE_REVOKED = "14141414-1414-4414-8414-141414141452";
const COMMENT_1 = "14141414-1414-4414-8414-141414141461";
const COMMENT_2 = "14141414-1414-4414-8414-141414141462";
const COMMENT_3 = "14141414-1414-4414-8414-141414141463";
const TEAM = "14141414-1414-4414-8414-141414141471";
const GAME = "14141414-1414-4414-8414-141414141472";
const SNAP = "14141414-1414-4414-8414-141414141473";
const FIXTURE = "14141414-1414-4414-8414-141414141474";
const CACHE = "14141414-1414-4414-8414-141414141475";
const RUN = "14141414-1414-4414-8414-141414141476";
const BUDDY_MSG = "14141414-1414-4414-8414-141414141481";
const BUDDY_NOTE = "14141414-1414-4414-8414-141414141482";
const CREATED = new Date("2024-01-02T03:04:05.678Z");
const STAMP = new Date("2024-06-01T12:00:00.000Z");
const NAME = `O'Brien "Ace" 🎯\ncafé`;
const BODY = `He said "it's a goal" 🎯\nnext line — café`;

const urlEnv = arg("--url-env");
const envFile = arg("--env-file");
if (!urlEnv || !envFile) {
  console.error("Usage: rehearsal-edges.ts --url-env <VAR> --env-file <path>");
  process.exit(1);
}
const url = readEnvFile(envFile)[urlEnv]?.trim();
if (!url) {
  console.error(`Env file has no value for ${urlEnv}`);
  process.exit(1);
}
const parsed = new URL(url);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  console.error("rehearsal-edges refuses non-local databases");
  process.exit(1);
}
if (parsed.port !== "55432") {
  console.error("rehearsal-edges refuses ports other than 55432");
  process.exit(1);
}

const sql = postgres(url, { max: 1, infer: true, onnotice: () => {} });
try {
  await sql.begin(async (tx) => {
    const groups = await tx`
      select id, created_by_user_id from groups where slug = 'sunday-league'
    `;
    const group = groups[0];
    if (!group) throw new Error("seed sunday-league before rehearsal edges");
    const groupId = String(group.id);
    const ownerId = String(group.created_by_user_id);

    await tx`delete from comment_votes where comment_id in (${COMMENT_1}, ${COMMENT_2}, ${COMMENT_3})`;
    await tx`delete from game_comments where id = ${COMMENT_3}`;
    await tx`delete from game_comments where id = ${COMMENT_2}`;
    await tx`delete from game_comments where id = ${COMMENT_1}`;
    await tx`delete from group_invites where id in (${INVITE_LINK}, ${INVITE_REVOKED})`;
    await tx`delete from credit_entries where user_id in (${NONAME}, ${QUOTES}, ${NOEMAIL})`;
    await tx`delete from wagers where user_id in (${NONAME}, ${QUOTES}, ${NOEMAIL})`;
    await tx`delete from users where id in (${NONAME}, ${QUOTES}, ${NOEMAIL})`;
    await tx`delete from fixture_context where id = ${FIXTURE}`;
    await tx`delete from game_snapshots where id = ${SNAP}`;
    await tx`delete from team_games where team_id = ${TEAM}`;
    await tx`delete from games where id = ${GAME}`;
    await tx`delete from teams where id = ${TEAM}`;
    await tx`delete from provider_cache where id = ${CACHE}`;
    await tx`delete from ingestion_runs where id = ${RUN}`;
    await tx`delete from verification_tokens where token = 't14-verify-token'`;

    await tx`
      insert into users (id, name, email, email_verified, image, created_at)
      values (
        ${NONAME},
        ${null},
        'noname@rehearsal.invalid',
        ${null},
        ${null},
        ${CREATED}
      )
    `;
    await tx`
      insert into users (id, name, email, email_verified, image, created_at)
      values (
        ${QUOTES},
        ${NAME},
        'obrien@rehearsal.invalid',
        ${CREATED},
        ${null},
        ${CREATED}
      )
    `;
    await tx`
      insert into users (id, name, email, created_at)
      values (${NOEMAIL}, 'Ghost', ${null}, ${CREATED})
    `;

    await tx`
      insert into accounts (
        user_id, type, provider, provider_account_id, refresh_token, access_token,
        expires_at, token_type, scope, id_token, session_state
      ) values (
        ${QUOTES},
        'oauth',
        'github',
        'obrien-github',
        ${"re'fresh"},
        ${"tok'en"},
        1700000000,
        'bearer',
        'read:user',
        'id.token',
        ${null}
      )
    `;
    await tx`
      insert into sessions (session_token, user_id, expires)
      values ('t14-rehearsal-session', ${QUOTES}, ${new Date("2030-01-01T00:00:00.000Z")})
    `;
    await tx`
      insert into verification_tokens (identifier, token, expires)
      values ('obrien@rehearsal.invalid', 't14-verify-token', ${new Date("2030-01-01T00:00:00.000Z")})
    `;

    await tx`
      insert into teams (
        id, slug, sport, provider, external_id, canonical, schedule,
        source_observed_at, fetched_at, expires_at, payload_hash, created_at, updated_at
      ) values (
        ${TEAM},
        't14-edge',
        'baseball',
        'rehearsal',
        't14-team',
        ${JSON.stringify({ name: "Edge United" })}::jsonb,
        ${null},
        ${STAMP},
        ${STAMP},
        ${STAMP},
        't14',
        ${STAMP},
        ${STAMP}
      )
    `;
    await tx`
      insert into games (
        id, canonical_id, sport, provider, external_id, summary, scheduled_at,
        source_observed_at, fetched_at, expires_at, payload_hash, created_at, updated_at
      ) values (
        ${GAME},
        't14-game',
        'baseball',
        'rehearsal',
        't14-game',
        ${JSON.stringify({ status: "finished", note: "it's done" })}::jsonb,
        ${STAMP},
        ${STAMP},
        ${STAMP},
        ${STAMP},
        't14-game',
        ${STAMP},
        ${STAMP}
      )
    `;
    await tx`
      insert into team_games (team_id, game_id) values (${TEAM}, ${GAME})
    `;
    await tx`
      insert into game_snapshots (
        id, route_id, game_id, team_id, schema_version, snapshot,
        source_observed_at, fetched_at, expires_at, payload_hash, created_at, updated_at
      ) values (
        ${SNAP},
        't14-game-edge',
        ${GAME},
        ${TEAM},
        1,
        ${JSON.stringify({ routeId: "t14-game-edge", note: "café" })}::jsonb,
        ${STAMP},
        ${STAMP},
        ${STAMP},
        't14-snap',
        ${STAMP},
        ${STAMP}
      )
    `;
    await tx`
      insert into fixture_context (id, game_id, facts, summary, built_at)
      values (
        ${FIXTURE},
        ${GAME},
        ${JSON.stringify([{ id: "fact-edge-1", text: "line\nbreak" }])}::jsonb,
        'edge summary',
        ${STAMP}
      )
    `;
    await tx`
      insert into provider_cache (id, provider, kind, scope, payload, fetched_at, expires_at)
      values (
        ${CACHE},
        'rehearsal',
        'discovery',
        't14',
        ${JSON.stringify({ quote: 'she said "hi"', emoji: "🎯" })}::jsonb,
        ${STAMP},
        ${STAMP}
      )
    `;
    await tx`
      insert into ingestion_runs (
        id, provider, operation, scope, status, attempt_count, request_id, started_at, completed_at
      ) values (
        ${RUN},
        'settlement',
        'settle',
        'all',
        'succeeded',
        1,
        't14-rehearsal',
        ${STAMP},
        ${STAMP}
      )
    `;

    await tx`
      insert into group_members (group_id, user_id, role, notify_on_activity, joined_at)
      values
        (${groupId}, ${NONAME}, 'member', ${false}, ${CREATED}),
        (${groupId}, ${QUOTES}, 'member', ${true}, ${CREATED})
    `;
    await tx`
      insert into group_invites (
        id, group_id, email, token, invited_by_user_id, status, created_at, expires_at
      ) values (
        ${INVITE_LINK},
        ${groupId},
        ${null},
        't14-link-invite',
        ${ownerId},
        'pending',
        ${CREATED},
        ${new Date("2030-01-01T00:00:00.000Z")}
      )
    `;
    await tx`
      insert into group_invites (
        id, group_id, email, token, invited_by_user_id, status, created_at, expires_at
      ) values (
        ${INVITE_REVOKED},
        ${groupId},
        'revoked@rehearsal.invalid',
        't14-revoked-invite',
        ${ownerId},
        'revoked',
        ${CREATED},
        ${new Date("2030-01-01T00:00:00.000Z")}
      )
    `;

    await tx`
      insert into wagers (
        id, user_id, group_id, canonical_game_id, route_id, sport, market_id, selection_id,
        market_label, selection_label, line, price, stake, potential_return, matchup,
        competition, scheduled_at, prices_version, rules_version, idempotency_key, created_at
      ) values (
        ${WAGER_TOTALS},
        ${QUOTES},
        ${groupId},
        't14-edge-totals',
        't14-edge-totals',
        'baseball',
        'baseball-total-8-5',
        'over',
        'Total',
        'Over',
        ${"8.5"}::numeric,
        ${"1.91"}::numeric,
        10,
        19,
        'Edge at Home',
        'Rehearsal',
        ${STAMP},
        'house',
        't14',
        ${null},
        ${CREATED}
      )
    `;
    await tx`
      insert into wagers (
        id, user_id, group_id, canonical_game_id, route_id, sport, market_id, selection_id,
        market_label, selection_label, line, price, stake, potential_return, matchup,
        competition, scheduled_at, prices_version, rules_version, idempotency_key, created_at
      ) values (
        ${WAGER_VOID},
        ${QUOTES},
        ${null},
        't14-edge-void',
        't14-edge-void',
        'baseball',
        'baseball-moneyline',
        'home',
        'Moneyline',
        'Home',
        ${null},
        ${"1.85"}::numeric,
        15,
        28,
        'Edge at Home',
        'Rehearsal',
        ${STAMP},
        'house',
        't14',
        ${null},
        ${CREATED}
      )
    `;
    await tx`
      insert into credit_entries (id, user_id, kind, amount, reason, created_at)
      values
        (${GRANT_NONAME}, ${NONAME}, 'grant', 1000, 'signup', ${CREATED}),
        (${GRANT_QUOTES}, ${QUOTES}, 'grant', 1000, 'signup', ${CREATED})
    `;
    await tx`
      insert into credit_entries (id, user_id, kind, amount, reason, wager_id, created_at)
      values
        (${STAKE_TOTALS}, ${QUOTES}, 'stake', -10, 'wager placed', ${WAGER_TOTALS}, ${CREATED}),
        (${STAKE_VOID}, ${QUOTES}, 'stake', -15, 'wager placed', ${WAGER_VOID}, ${CREATED})
    `;
    await tx`
      insert into credit_entries (
        id, user_id, kind, amount, reason, wager_id, outcome, settlement_run_id, created_at
      ) values (
        ${RETURN_VOID},
        ${QUOTES},
        'return',
        15,
        'wager settled',
        ${WAGER_VOID},
        'void',
        ${RUN},
        ${STAMP}
      )
    `;
    await tx`
      insert into credit_entries (id, user_id, kind, amount, reason, created_at)
      values (${RESET}, ${QUOTES}, 'reset', 0, 'reset', ${STAMP})
    `;

    await tx`
      insert into game_comments (
        id, group_id, canonical_game_id, user_id, parent_comment_id, phase, body, created_at
      ) values (
        ${COMMENT_1},
        ${groupId},
        't14-edge-thread',
        ${QUOTES},
        ${null},
        'before',
        ${BODY},
        ${CREATED}
      )
    `;
    await tx`
      insert into game_comments (
        id, group_id, canonical_game_id, user_id, parent_comment_id, phase, body, created_at
      ) values (
        ${COMMENT_2},
        ${groupId},
        't14-edge-thread',
        ${ownerId},
        ${COMMENT_1},
        'before',
        'reply',
        ${CREATED}
      )
    `;
    await tx`
      insert into game_comments (
        id, group_id, canonical_game_id, user_id, parent_comment_id, phase, body, created_at
      ) values (
        ${COMMENT_3},
        ${groupId},
        't14-edge-thread',
        ${NONAME},
        ${COMMENT_2},
        'before',
        'nested',
        ${CREATED}
      )
    `;
    await tx`
      insert into comment_votes (comment_id, user_id, kind, created_at)
      values (${COMMENT_1}, ${ownerId}, 'shame', ${CREATED})
    `;
    await tx`
      insert into buddy_messages (
        id, conversation, user_id, session_hash, ip_hash, role, text, route,
        fact_ids, pick_id, status, reason, created_at
      ) values (
        ${BUDDY_MSG},
        ${BUDDY_MSG},
        ${QUOTES},
        'session-hash',
        'ip-hash',
        'user',
        'Noted the café 🎯',
        'game',
        ${["fact-edge-1", "fact-edge-2"]}::text[],
        ${null},
        'ok',
        ${null},
        ${CREATED}
      )
    `;
    await tx`
      insert into buddy_notes (id, user_id, session_hash, note, created_at)
      values (${BUDDY_NOTE}, ${QUOTES}, 'session-hash', ${"O'Brien likes café"}, ${CREATED})
    `;
  });
  console.log("EDGES OK");
} finally {
  await sql.end({ timeout: 5 });
}
