import { and, desc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "../db/client";
import { groupMembers, groups, user } from "../db/schema";

/**
 * Groups the slip can attach a wager to. T10 ports the rest of this module.
 * Only id, name, and role — the selector renders the first two.
 */
export async function listGroupsForUser(
  userId: string,
): Promise<{ id: string; name: string; role: "owner" | "member" }[]> {
  return getDatabase()
    .select({
      id: groups.id,
      name: groups.name,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.userId, userId))
    .orderBy(desc(groupMembers.joinedAt));
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
