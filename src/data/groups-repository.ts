import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  creditEntries,
  groupMembers,
  groups,
  users,
  wagers,
} from "@/db/schema";
import {
  groupLeaderboardEntrySchema,
  groupMemberSchema,
  groupSchema,
  type Group,
  type GroupLeaderboardEntry,
  type GroupMember,
  type GroupMemberRole,
} from "@/lib/contracts";

function rowToGroup(row: typeof groups.$inferSelect): Group {
  return groupSchema.parse({
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
  });
}

export async function getGroupBySlug(slug: string): Promise<Group | undefined> {
  const [row] = await getDatabase()
    .select()
    .from(groups)
    .where(eq(groups.slug, slug))
    .limit(1);
  return row ? rowToGroup(row) : undefined;
}

export async function listGroupsForUser(
  userId: string,
): Promise<(Group & { role: GroupMemberRole })[]> {
  const rows = await getDatabase()
    .select({ group: groups, role: groupMembers.role })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, userId))
    .orderBy(desc(groupMembers.joinedAt));
  return rows.map((row) => ({ ...rowToGroup(row.group), role: row.role }));
}

export async function isGroupMember(
  groupId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await getDatabase()
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
    )
    .limit(1);
  return Boolean(row);
}

export async function listGroupMembers(
  groupId: string,
): Promise<GroupMember[]> {
  const rows = await getDatabase()
    .select({
      groupId: groupMembers.groupId,
      userId: groupMembers.userId,
      role: groupMembers.role,
      notifyOnActivity: groupMembers.notifyOnActivity,
      joinedAt: groupMembers.joinedAt,
      name: users.name,
      email: users.email,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(groupMembers.joinedAt);
  return rows.map((row) =>
    groupMemberSchema.parse({ ...row, joinedAt: row.joinedAt.toISOString() }),
  );
}

export type NotifiableMember = {
  userId: string;
  email: string;
  name: string | null;
};

/**
 * Members who opted in (`notifyOnActivity`) and have an email on file, minus
 * the person who caused the event. A member with no email is simply not
 * notifiable — never a failure, and never a fabricated address.
 */
export async function listNotifiableMembers(
  groupId: string,
  excludeUserId?: string,
): Promise<NotifiableMember[]> {
  const rows = await getDatabase()
    .select({
      userId: groupMembers.userId,
      name: users.name,
      email: users.email,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.notifyOnActivity, true),
      ),
    );
  return rows.flatMap((row) =>
    row.email && row.userId !== excludeUserId
      ? [{ userId: row.userId, name: row.name, email: row.email }]
      : [],
  );
}

export async function setNotifyOnActivity(input: {
  groupId: string;
  userId: string;
  notifyOnActivity: boolean;
}): Promise<boolean> {
  const [row] = await getDatabase()
    .update(groupMembers)
    .set({ notifyOnActivity: input.notifyOnActivity })
    .where(
      and(
        eq(groupMembers.groupId, input.groupId),
        eq(groupMembers.userId, input.userId),
      ),
    )
    .returning({ userId: groupMembers.userId });
  return Boolean(row);
}

/** Name + slug for the groups a settlement run touched, in one read. */
export async function listGroupsByIds(
  ids: string[],
): Promise<Map<string, { name: string; slug: string }>> {
  if (ids.length === 0) return new Map();
  const rows = await getDatabase()
    .select({ id: groups.id, name: groups.name, slug: groups.slug })
    .from(groups)
    .where(inArray(groups.id, ids));
  return new Map(
    rows.map((row) => [row.id, { name: row.name, slug: row.slug }]),
  );
}

/**
 * Net return (sum of `return`/`stake` credit_entries) over a group's wagers
 * only, grouped by member — a read-time aggregate over the existing ledger,
 * never a stored column, same as CreditSummary. Sorted in JS rather than SQL:
 * group sizes are small and it avoids ordering by a computed alias.
 */
export async function getGroupLeaderboard(
  groupId: string,
): Promise<GroupLeaderboardEntry[]> {
  const rows = await getDatabase()
    .select({
      userId: creditEntries.userId,
      name: users.name,
      netReturn: sql<number>`coalesce(sum(${creditEntries.amount}), 0)::int`,
      wagerCount: sql<number>`count(distinct ${creditEntries.wagerId})::int`,
      won: sql<number>`coalesce(count(*) filter (where ${creditEntries.outcome} = 'won'), 0)::int`,
      lost: sql<number>`coalesce(count(*) filter (where ${creditEntries.outcome} = 'lost'), 0)::int`,
      voided: sql<number>`coalesce(count(*) filter (where ${creditEntries.outcome} = 'void'), 0)::int`,
    })
    .from(creditEntries)
    .innerJoin(wagers, eq(wagers.id, creditEntries.wagerId))
    .innerJoin(users, eq(users.id, creditEntries.userId))
    .where(
      and(
        eq(wagers.groupId, groupId),
        inArray(creditEntries.kind, ["stake", "return"]),
      ),
    )
    .groupBy(creditEntries.userId, users.name);

  const entries = rows.map((row) => groupLeaderboardEntrySchema.parse(row));
  return entries.sort((a, b) => b.netReturn - a.netReturn);
}
