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

// App code speaks the Neon driver and cannot connect to plain Postgres (see
// src/db/database.integration.test.ts), so — same as that suite — this one
// drives raw SQL that mirrors the exact statements game-comments.ts issues:
// the eligibility select, the bare `.onConflictDoNothing()` insert, and the
// per-group comment read. It proves the schema and the unique index hold,
// which is the actual feature.
let container: StartedPostgreSqlContainer;
let sql: Sql;

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

async function createGame(canonicalId: string) {
  await sql`
    insert into games (
      canonical_id, sport, provider, external_id, summary, scheduled_at,
      source_observed_at, fetched_at, expires_at, payload_hash
    ) values (
      ${canonicalId}, 'soccer', 'football-data', ${canonicalId}, '{}',
      now() + interval '1 day', now(), now(), now(), ${`hash-${canonicalId}`}
    )
  `;
}

/** Mirrors placeWager: a wager only ever carries a groupId once membership
 * was already verified, so this is what makes a wager row itself the
 * eligibility fact — no separate group_members join needed to read it back. */
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

/** The exact predicate postComment and listCommentThreads both re-check:
 * "you have a wager in this group on this game." */
async function isEligible(
  userId: string,
  groupId: string,
  canonicalGameId: string,
) {
  const [row] = await sql<{ id: string }[]>`
    select id from wagers
    where user_id = ${userId} and group_id = ${groupId}
      and canonical_game_id = ${canonicalGameId}
    limit 1
  `;
  return Boolean(row);
}

/** The exact statement postComment issues: insert, bare
 * `on conflict do nothing`, returning nothing when the unique index bites. */
async function postCommentRaw(
  groupId: string,
  canonicalGameId: string,
  userId: string,
  phase: "before" | "after",
  body: string,
) {
  const rows = await sql<{ id: string }[]>`
    insert into game_comments (group_id, canonical_game_id, user_id, phase, body)
    values (${groupId}, ${canonicalGameId}, ${userId}, ${phase}, ${body})
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

async function listThreadsRaw(userId: string, canonicalGameId: string) {
  const eligibleGroups = await sql<{ group_id: string; group_name: string }[]>`
    select distinct w.group_id, g.name as group_name
    from wagers w
    join groups g on g.id = w.group_id
    where w.user_id = ${userId} and w.canonical_game_id = ${canonicalGameId}
  `;
  const threads = [];
  for (const group of eligibleGroups) {
    const comments = await sql<
      { body: string; phase: string; user_id: string }[]
    >`
      select body, phase, user_id from game_comments
      where group_id = ${group.group_id} and canonical_game_id = ${canonicalGameId}
      order by created_at asc
    `;
    threads.push({
      groupId: group.group_id,
      groupName: group.group_name,
      comments,
    });
  }
  return threads;
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

    expect(
      await postCommentRaw(
        groupId,
        canonicalGameId,
        userId,
        "before",
        "Madrid win it",
      ),
    ).toBe(true);
    expect(
      await postCommentRaw(
        groupId,
        canonicalGameId,
        userId,
        "before",
        "Actually, draw",
      ),
    ).toBe(false);

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

    expect(
      await postCommentRaw(
        groupId,
        canonicalGameId,
        userId,
        "before",
        "Madrid win it",
      ),
    ).toBe(true);
    expect(
      await postCommentRaw(
        groupId,
        canonicalGameId,
        userId,
        "after",
        "Called it",
      ),
    ).toBe(true);

    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from game_comments
      where group_id = ${groupId} and canonical_game_id = ${canonicalGameId} and user_id = ${userId}
    `;
    expect(count).toBe(2);
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

    expect(await isEligible(member, groupId, canonicalGameId)).toBe(false);
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

    expect(await isEligible(outsider, groupId, canonicalGameId)).toBe(false);
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

    await postCommentRaw(
      groupA,
      canonicalGameId,
      userA,
      "before",
      "Group A take",
    );
    await postCommentRaw(
      groupB,
      canonicalGameId,
      userB,
      "before",
      "Group B take",
    );

    const threadsForA = await listThreadsRaw(userA, canonicalGameId);
    const threadsForB = await listThreadsRaw(userB, canonicalGameId);

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
    await postCommentRaw(
      groupId,
      canonicalGameId,
      userId,
      "before",
      "Madrid win it",
    );

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
