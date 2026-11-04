import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  groupInviteSchema,
  groupLeaderboardEntrySchema,
  groupMemberSchema,
  groupSchema,
  type Group,
  type GroupInvite,
  type GroupInviteStatus,
  type GroupLeaderboardEntry,
  type GroupMember,
  type GroupMemberRole,
} from "../domain/contracts";
import { getDatabase } from "../db/client";
import {
  creditEntries,
  groupInvites,
  groupMembers,
  groups,
  user,
  wagers,
} from "../db/schema";

function toIso(value: Date | number | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

export function rowToGroup(row: typeof groups.$inferSelect): Group {
  return groupSchema.parse({
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdByUserId: row.createdByUserId,
    createdAt: toIso(row.createdAt),
  });
}

export function rowToInvite(
  row: typeof groupInvites.$inferSelect,
): GroupInvite {
  return groupInviteSchema.parse({
    id: row.id,
    groupId: row.groupId,
    email: row.email,
    status: row.status,
    createdAt: toIso(row.createdAt),
    expiresAt: toIso(row.expiresAt),
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
      name: user.name,
      email: user.email,
    })
    .from(groupMembers)
    .innerJoin(user, eq(user.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(groupMembers.joinedAt);
  return rows.map((row) =>
    groupMemberSchema.parse({ ...row, joinedAt: toIso(row.joinedAt) }),
  );
}

type NotifiableMember = {
  userId: string;
  name: string | null;
  email: string;
};

/** Members who still want activity mail, excluding the actor. */
export async function listNotifiableMembers(
  groupId: string,
  excludeUserId?: string,
): Promise<NotifiableMember[]> {
  const rows = await getDatabase()
    .select({
      userId: groupMembers.userId,
      name: user.name,
      email: user.email,
    })
    .from(groupMembers)
    .innerJoin(user, eq(user.id, groupMembers.userId))
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
  const rows = await getDatabase()
    .update(groupMembers)
    .set({ notifyOnActivity: input.notifyOnActivity })
    .where(
      and(
        eq(groupMembers.groupId, input.groupId),
        eq(groupMembers.userId, input.userId),
      ),
    )
    .returning({ userId: groupMembers.userId });
  return rows.length > 0;
}

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

export type InvitePreview = {
  groupId: string;
  groupName: string;
  groupSlug: string;
  invitedByName: string | null;
  status: GroupInviteStatus;
  expiresAt: string;
};

/**
 * Read-only. The accept screen previews an invite before anyone presses
 * Join, so nothing here mutates a status even when the invite has expired.
 */
export async function previewInvite(
  token: string,
): Promise<InvitePreview | undefined> {
  const [row] = await getDatabase()
    .select({
      groupId: groups.id,
      groupName: groups.name,
      groupSlug: groups.slug,
      invitedByName: user.name,
      status: groupInvites.status,
      expiresAt: groupInvites.expiresAt,
    })
    .from(groupInvites)
    .innerJoin(groups, eq(groups.id, groupInvites.groupId))
    .innerJoin(user, eq(user.id, groupInvites.invitedByUserId))
    .where(eq(groupInvites.token, token))
    .limit(1);
  if (!row) return undefined;
  return { ...row, expiresAt: toIso(row.expiresAt) };
}

/** So a member can see, and revoke, what is outstanding. */
export async function listPendingInvites(
  groupId: string,
): Promise<GroupInvite[]> {
  const rows = await getDatabase()
    .select()
    .from(groupInvites)
    .where(
      and(
        eq(groupInvites.groupId, groupId),
        eq(groupInvites.status, "pending"),
      ),
    )
    .orderBy(desc(groupInvites.createdAt));
  return rows.map(rowToInvite);
}

/**
 * Net return over a group's wagers, one row per member. A read-time
 * aggregate, never a stored column. Members with no group wagers stay on
 * the board at 0. Sorted in JS; groups are small.
 */
export async function getGroupLeaderboard(
  groupId: string,
): Promise<GroupLeaderboardEntry[]> {
  const rows = await getDatabase()
    .select({
      userId: groupMembers.userId,
      name: user.name,
      netReturn: sql<number>`coalesce(sum(${creditEntries.amount}), 0)`.mapWith(
        Number,
      ),
      wagerCount:
        sql<number>`coalesce(count(distinct ${creditEntries.wagerId}), 0)`.mapWith(
          Number,
        ),
      won: sql<number>`coalesce(sum(case when ${creditEntries.outcome} = 'won' then 1 else 0 end), 0)`.mapWith(
        Number,
      ),
      lost: sql<number>`coalesce(sum(case when ${creditEntries.outcome} = 'lost' then 1 else 0 end), 0)`.mapWith(
        Number,
      ),
      voided:
        sql<number>`coalesce(sum(case when ${creditEntries.outcome} = 'void' then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
    })
    .from(groupMembers)
    .innerJoin(user, eq(user.id, groupMembers.userId))
    .leftJoin(
      wagers,
      and(eq(wagers.groupId, groupId), eq(wagers.userId, groupMembers.userId)),
    )
    .leftJoin(
      creditEntries,
      and(
        eq(creditEntries.wagerId, wagers.id),
        inArray(creditEntries.kind, ["stake", "return"]),
      ),
    )
    .where(eq(groupMembers.groupId, groupId))
    .groupBy(groupMembers.userId, user.name);

  const entries = rows.map((row) =>
    groupLeaderboardEntrySchema.parse({
      userId: row.userId,
      name: row.name,
      netReturn: Math.trunc(row.netReturn),
      wagerCount: Math.trunc(row.wagerCount),
      won: Math.trunc(row.won),
      lost: Math.trunc(row.lost),
      voided: Math.trunc(row.voided),
    }),
  );
  return entries.sort((a, b) => b.netReturn - a.netReturn);
}
