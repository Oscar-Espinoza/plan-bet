import { and, eq, inArray } from "drizzle-orm";
import { getDatabase } from "../db/client";
import { groupMembers, groups, user } from "../db/schema";

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
