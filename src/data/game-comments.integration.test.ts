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
import { listCommentThreads, postComment } from "@/data/game-comments";

// App code speaks the Neon driver and cannot connect to plain Postgres (see
// src/db/database.integration.test.ts), so this suite installs a postgres-js
// handle through `setDatabaseForTests` and drives the real `postComment` /
// `listCommentThreads` functions against it — the same functions the API
// routes call, not a hand-copied mirror of their SQL.
let container: StartedPostgreSqlContainer;
let sql: Sql;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  sql = postgres(container.getConnectionUri(), { max: 2 });
  await migrate(drizzle(sql), {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });
  // getDatabase() throws DatabaseConfigurationError unless this is set, even
  // once a handle is installed below — the value itself is never read.
  process.env.DATABASE_URL = container.getConnectionUri();
  setDatabaseForTests(drizzle(sql));
});

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

async function createUser(email: string) {
  const [user] = await sql<{ id: string }[]>`
    insert into users (email) values (${email}) returning id
  `;
  return user!.id;
}

async function createGroup(ownerId: string, name: string) {
  const [group] = await sql<{ id: string }[]>`
    insert into groups (name, slug, created_by_user_id)
    values (${name}, ${`slug-${randomUUID()}`}, ${ownerId})
    returning id
  `;
  return group!.id;
}

async function addGroupMember(groupId: string, userId: string) {
  await sql`
    insert into group_members (group_id, user_id, role)
    values (${groupId}, ${userId}, 'member')
  `;
}

/** `variant` controls whether kickoff is ahead of or behind the real clock,
 * so `postComment`'s phase derivation can be exercised both ways without
 * ever passing a phase in from the test. */
async function createGame(
  canonicalId: string,
  variant: "future" | "past" = "future",
) {
  const scheduledAt =
    variant === "future"
      ? sql`now() + interval '1 day'`
      : sql`now() - interval '1 day'`;
  await sql`
    insert into games (
      canonical_id, sport, provider, external_id, summary, scheduled_at,
      source_observed_at, fetched_at, expires_at, payload_hash
    ) values (
      ${canonicalId}, 'soccer', 'football-data', ${canonicalId}, '{}',
      ${scheduledAt}, now(), now(), now(), ${`hash-${canonicalId}`}
    )
  `;
}

/** Mirrors placeWager: a wager only ever carries a groupId once membership
 * was already verified, so this is what makes a wager row itself the
 * eligibility fact — no separate group_members join needed to read it back.
 * `selection` defaults to the home side; tests that need two sides of the
 * same game pass the away side explicitly. */
async function insertWagerForGroup(
  userId: string,
  groupId: string,
  canonicalGameId: string,
) {
  await sql`
    insert into wagers (
      user_id, group_id, canonical_game_id, route_id, sport, market_id,
      selection_id, market_label, selection_label, price, stake,
      potential_return, matchup, competition, scheduled_at, prices_version,
      rules_version
    ) values (
      ${userId}, ${groupId}, ${canonicalGameId}, ${`${canonicalGameId}-real-madrid`},
      'soccer', 'soccer-match-result', 'home', 'Match Result', 'Home', 2.40,
      25, 60, 'Barcelona at Real Madrid', 'La Liga', now() + interval '1 day',
      'v1', 'v1'
    )
  `;
}

describe("Phase F game_comments", () => {
  it("applies the migration with no updated_at or delete path columns", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public'
    `;
    expect(rows.map((row) => row.table_name)).toContain("game_comments");

    const columns = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'game_comments'
    `;
    const names = columns.map((column) => column.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "group_id",
        "canonical_game_id",
        "user_id",
        "phase",
        "body",
        "created_at",
      ]),
    );
    expect(names).not.toContain("updated_at");
    expect(names).not.toContain("status");
  });

  it("rejects a second 'before' comment from the same user in the same group on the same game", async () => {
    const userId = await createUser(`before-twice-${randomUUID()}@example.com`);
    const groupId = await createGroup(userId, "Sunday League");
    await addGroupMember(groupId, userId);
    const canonicalGameId = `football-data-${randomUUID().slice(0, 8)}`;
    await createGame(canonicalGameId);
    await insertWagerForGroup(userId, groupId, canonicalGameId);

    const first = await postComment({
      userId,
      groupId,
      canonicalGameId,
      body: "Madrid win it",
      now: new Date(),
    });
    expect(first.ok).toBe(true);

    const second = await postComment({
      userId,
      groupId,
      canonicalGameId,
      body: "Actually, draw",
      now: new Date(),
    });
    expect(second).toEqual({ ok: false, reason: "already_commented" });

    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from game_comments
      where group_id = ${groupId} and canonical_game_id = ${canonicalGameId} and phase = 'before'
    `;
    expect(count).toBe(1);
  });

  it("still accepts that same user's 'after' comment — the pair is the whole point", async () => {
    const userId = await createUser(`before-after-${randomUUID()}@example.com`);
    const groupId = await createGroup(userId, "Sunday League");
    await addGroupMember(groupId, userId);
    const canonicalGameId = `football-data-${randomUUID().slice(0, 8)}`;
    await createGame(canonicalGameId);
    await insertWagerForGroup(userId, groupId, canonicalGameId);

    const before = await postComment({
      userId,
      groupId,
      canonicalGameId,
      body: "Madrid win it",
      now: new Date(),
    });
    expect(before.ok && before.comment.phase).toBe("before");

    // The same real clock, now read against a game already past kickoff —
    // postComment derives "after" from that alone, never from an argument.
    const after = await postComment({
      userId,
      groupId,
      canonicalGameId,
      body: "Called it",
      now: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });
    expect(after.ok && after.comment.phase).toBe("after");

    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from game_comments
      where group_id = ${groupId} and canonical_game_id = ${canonicalGameId} and user_id = ${userId}
    `;
    expect(count).toBe(2);
  });

  it("derives the comment phase from the game's own clock, never from client input", async () => {
    const userId = await createUser(`phase-clock-${randomUUID()}@example.com`);
    const groupId = await createGroup(userId, "Sunday League");
    await addGroupMember(groupId, userId);

    const futureGameId = `football-data-${randomUUID().slice(0, 8)}`;
    await createGame(futureGameId, "future");
    await insertWagerForGroup(userId, groupId, futureGameId);
    const beforeResult = await postComment({
      userId,
      groupId,
      canonicalGameId: futureGameId,
      body: "not yet",
      now: new Date(),
    });
    expect(beforeResult.ok && beforeResult.comment.phase).toBe("before");

    const pastGameId = `football-data-${randomUUID().slice(0, 8)}`;
    await createGame(pastGameId, "past");
    await insertWagerForGroup(userId, groupId, pastGameId);
    const afterResult = await postComment({
      userId,
      groupId,
      canonicalGameId: pastGameId,
      body: "already happened",
      now: new Date(),
    });
    expect(afterResult.ok && afterResult.comment.phase).toBe("after");
  });

  it("treats a group member with no wager on this game as not eligible", async () => {
    const owner = await createUser(
      `no-wager-owner-${randomUUID()}@example.com`,
    );
    const member = await createUser(
      `no-wager-member-${randomUUID()}@example.com`,
    );
    const groupId = await createGroup(owner, "Sunday League");
    await addGroupMember(groupId, owner);
    await addGroupMember(groupId, member);
    const canonicalGameId = `football-data-${randomUUID().slice(0, 8)}`;
    await createGame(canonicalGameId);
    await insertWagerForGroup(owner, groupId, canonicalGameId);
    // member never places a wager on this game.

    const result = await postComment({
      userId: member,
      groupId,
      canonicalGameId,
      body: "can I say something",
      now: new Date(),
    });
    expect(result).toEqual({ ok: false, reason: "not_eligible" });
  });

  it("treats a non-member as not eligible", async () => {
    const owner = await createUser(
      `non-member-owner-${randomUUID()}@example.com`,
    );
    const outsider = await createUser(
      `non-member-outsider-${randomUUID()}@example.com`,
    );
    const groupId = await createGroup(owner, "Sunday League");
    await addGroupMember(groupId, owner);
    // outsider is never added to group_members.
    const canonicalGameId = `football-data-${randomUUID().slice(0, 8)}`;
    await createGame(canonicalGameId);
    await insertWagerForGroup(owner, groupId, canonicalGameId);

    const result = await postComment({
      userId: outsider,
      groupId,
      canonicalGameId,
      body: "let me in",
      now: new Date(),
    });
    expect(result).toEqual({ ok: false, reason: "not_eligible" });
  });

  it("treats an unknown game as unavailable, even with an eligible wager on it", async () => {
    const userId = await createUser(`unknown-game-${randomUUID()}@example.com`);
    const groupId = await createGroup(userId, "Sunday League");
    await addGroupMember(groupId, userId);
    const canonicalGameId = `football-data-${randomUUID().slice(0, 8)}`;
    // A wager exists (eligibility passes) but no games row was ever inserted.
    await insertWagerForGroup(userId, groupId, canonicalGameId);

    const result = await postComment({
      userId,
      groupId,
      canonicalGameId,
      body: "ghost game",
      now: new Date(),
    });
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("keeps two groups on the same game as two separate threads, neither visible from the other", async () => {
    const userA = await createUser(`two-groups-a-${randomUUID()}@example.com`);
    const userB = await createUser(`two-groups-b-${randomUUID()}@example.com`);
    const groupA = await createGroup(userA, "Group A");
    const groupB = await createGroup(userB, "Group B");
    await addGroupMember(groupA, userA);
    await addGroupMember(groupB, userB);
    const canonicalGameId = `football-data-${randomUUID().slice(0, 8)}`;
    await createGame(canonicalGameId);
    await insertWagerForGroup(userA, groupA, canonicalGameId);
    await insertWagerForGroup(userB, groupB, canonicalGameId);

    await postComment({
      userId: userA,
      groupId: groupA,
      canonicalGameId,
      body: "Group A take",
      now: new Date(),
    });
    await postComment({
      userId: userB,
      groupId: groupB,
      canonicalGameId,
      body: "Group B take",
      now: new Date(),
    });

    const threadsForA = await listCommentThreads(userA, canonicalGameId);
    const threadsForB = await listCommentThreads(userB, canonicalGameId);

    expect(threadsForA).toHaveLength(1);
    expect(threadsForA[0]!.groupId).toBe(groupA);
    expect(threadsForA[0]!.comments.map((c) => c.body)).toEqual([
      "Group A take",
    ]);

    expect(threadsForB).toHaveLength(1);
    expect(threadsForB[0]!.groupId).toBe(groupB);
    expect(threadsForB[0]!.comments.map((c) => c.body)).toEqual([
      "Group B take",
    ]);
  });

  it("cascades from groups and users to game_comments on delete", async () => {
    const userId = await createUser(`cascade-${randomUUID()}@example.com`);
    const groupId = await createGroup(userId, "Sunday League");
    await addGroupMember(groupId, userId);
    const canonicalGameId = `football-data-${randomUUID().slice(0, 8)}`;
    await createGame(canonicalGameId);
    await insertWagerForGroup(userId, groupId, canonicalGameId);
    await postComment({
      userId,
      groupId,
      canonicalGameId,
      body: "Madrid win it",
      now: new Date(),
    });

    // Deleting the user cascades to wagers (userId FK) first, which clears
    // the only FK still pointing at the group from outside this test, then
    // to groups (createdByUserId FK) and from there to game_comments
    // (groupId FK) — the same chain a real account deletion would walk.
    await sql`delete from users where id = ${userId}`;

    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from game_comments where group_id = ${groupId}
    `;
    expect(count).toBe(0);
  });
});
