import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import type { Group, GroupInvite } from "../domain/contracts";
import { getDatabase } from "../db/client";
import { groupInvites, groupMembers, groups, user } from "../db/schema";
import { isGroupMember, rowToGroup, rowToInvite } from "./groups-repository";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type RunMeta = { meta?: { changes?: number } };

function changedRows(result: RunMeta | undefined): number {
  return result?.meta?.changes ?? 0;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause =
      "cause" in error && error.cause !== error ? errorText(error.cause) : "";
    return `${error.message} ${cause}`;
  }
  return String(error ?? "");
}

function isUniqueConflict(error: unknown): boolean {
  return /unique constraint failed/i.test(errorText(error));
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "group";
}

/**
 * The slug unique index replaces the classid-5 lock. A conflicting insert
 * is a no-op and the next attempt uses a short suffix, same as legacy.
 */
export async function createGroup(input: {
  userId: string;
  name: string;
}): Promise<Group> {
  const base = slugify(input.name);
  const db = getDatabase();
  let slug = base;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = crypto.randomUUID();
    const now = new Date();
    const [inserted, member] = (await db.batch([
      db
        .insert(groups)
        .values({
          id,
          name: input.name,
          slug,
          createdByUserId: input.userId,
          createdAt: now,
        })
        .onConflictDoNothing({ target: groups.slug }),
      db.insert(groupMembers).select(sql`
        select ${id}, ${input.userId}, 'owner', 1, ${now.getTime()}
        where exists (select 1 from ${groups} where ${groups.id} = ${id})
      `),
    ])) as unknown as [RunMeta, RunMeta];

    if (changedRows(inserted) === 1) {
      if (changedRows(member) !== 1) {
        throw new Error("Group owner membership was not created");
      }
      const [row] = await db
        .select()
        .from(groups)
        .where(eq(groups.id, id))
        .limit(1);
      if (row) return rowToGroup(row);
    }
    slug = `${base}-${crypto.randomUUID().slice(0, 6)}`;
  }

  throw new Error("Could not allocate a group slug");
}

export type InviteToGroupResult =
  | { ok: true; invite: GroupInvite; token: string }
  | { ok: false; reason: "not_a_member" }
  | { ok: false; reason: "already_member" };

export async function inviteToGroup(input: {
  groupId: string;
  invitedByUserId: string;
  email: string;
  now?: Date;
}): Promise<InviteToGroupResult> {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const expiresMs = nowMs + INVITE_TTL_MS;
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const db = getDatabase();

  const [inserted] = (await db.batch([
    db.insert(groupInvites).select(sql`
      select
        ${id},
        ${input.groupId},
        ${input.email},
        ${token},
        ${input.invitedByUserId},
        'pending',
        ${nowMs},
        ${expiresMs}
      where exists (
        select 1 from ${groupMembers}
        where ${groupMembers.groupId} = ${input.groupId}
          and ${groupMembers.userId} = ${input.invitedByUserId}
      )
      and not exists (
        select 1 from ${user} u
        inner join ${groupMembers} m on m.user_id = u.id
        where m.group_id = ${input.groupId}
          and u.email = ${input.email}
      )
    `),
  ])) as unknown as [RunMeta];

  if (changedRows(inserted) === 1) {
    const [row] = await db
      .select()
      .from(groupInvites)
      .where(eq(groupInvites.id, id))
      .limit(1);
    if (row) {
      return { ok: true, token: row.token, invite: rowToInvite(row) };
    }
  }

  if (!(await isGroupMember(input.groupId, input.invitedByUserId))) {
    return { ok: false, reason: "not_a_member" };
  }
  const [existingMember] = await db
    .select({ userId: user.id })
    .from(user)
    .innerJoin(groupMembers, eq(groupMembers.userId, user.id))
    .where(
      and(eq(groupMembers.groupId, input.groupId), eq(user.email, input.email)),
    )
    .limit(1);
  if (existingMember) return { ok: false, reason: "already_member" };
  return { ok: false, reason: "not_a_member" };
}

export type CreateJoinLinkResult =
  | { ok: true; invite: GroupInvite; token: string }
  | { ok: false; reason: "not_a_member" };

/**
 * One pending link invite per group. The partial unique index rejects a
 * second pending link. That error is caught and both callers read the
 * single pending row. Drizzle emits ON CONFLICT WHERE after DO NOTHING,
 * which SQLite rejects, so the index itself is the guard.
 */
export async function createJoinLink(input: {
  groupId: string;
  userId: string;
  now?: Date;
}): Promise<CreateJoinLinkResult> {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const expiresMs = nowMs + INVITE_TTL_MS;
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const db = getDatabase();

  try {
    await db.batch([
      db
        .update(groupInvites)
        .set({ status: "expired" })
        .where(
          and(
            eq(groupInvites.groupId, input.groupId),
            isNull(groupInvites.email),
            eq(groupInvites.status, "pending"),
            lte(groupInvites.expiresAt, now),
          ),
        ),
      db.insert(groupInvites).select(
        sql`
            select
              ${id},
              ${input.groupId},
              null,
              ${token},
              ${input.userId},
              'pending',
              ${nowMs},
              ${expiresMs}
            where exists (
              select 1 from ${groupMembers}
              where ${groupMembers.groupId} = ${input.groupId}
                and ${groupMembers.userId} = ${input.userId}
            )
            and not exists (
              select 1 from ${groupInvites}
              where ${groupInvites.groupId} = ${input.groupId}
                and ${groupInvites.email} is null
                and ${groupInvites.status} = 'pending'
                and ${groupInvites.expiresAt} > ${nowMs}
            )
          `,
      ),
    ]);
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
  }

  const [row] = await db
    .select()
    .from(groupInvites)
    .where(
      and(
        eq(groupInvites.groupId, input.groupId),
        isNull(groupInvites.email),
        eq(groupInvites.status, "pending"),
        gt(groupInvites.expiresAt, now),
      ),
    )
    .limit(1);
  if (row) return { ok: true, token: row.token, invite: rowToInvite(row) };
  if (!(await isGroupMember(input.groupId, input.userId))) {
    return { ok: false, reason: "not_a_member" };
  }
  throw new Error("Join link was not created");
}

export type RevokeInviteResult =
  { ok: true } | { ok: false; reason: "not_a_member" };

/**
 * Conditional pending → revoked, and only for a current member. A second
 * revoke, or a revoke that loses to accept, changes no row and still
 * returns ok when the caller is a member.
 */
export async function revokeInvite(input: {
  inviteId: string;
  groupId: string;
  userId: string;
}): Promise<RevokeInviteResult> {
  const db = getDatabase();
  const [revoked] = (await db.batch([
    db
      .update(groupInvites)
      .set({ status: "revoked" })
      .where(
        and(
          eq(groupInvites.id, input.inviteId),
          eq(groupInvites.groupId, input.groupId),
          eq(groupInvites.status, "pending"),
          sql`exists (
            select 1 from ${groupMembers}
            where ${groupMembers.groupId} = ${input.groupId}
              and ${groupMembers.userId} = ${input.userId}
          )`,
        ),
      ),
  ])) as unknown as [RunMeta];
  if (changedRows(revoked) === 1) return { ok: true };
  if (!(await isGroupMember(input.groupId, input.userId))) {
    return { ok: false, reason: "not_a_member" };
  }
  return { ok: true };
}

export type AcceptGroupInviteResult =
  | { ok: true; groupSlug: string }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "expired" }
  | { ok: false; reason: "email_mismatch" };

/**
 * classid 5, without a lock. Expire, claim, and insert the member in one
 * batch. changes() ties the member insert to this request's claim, so a
 * revoke that commits first leaves no membership. meta.changes of the
 * claim is what the caller treats as the win.
 */
export async function acceptGroupInvite(input: {
  token: string;
  userId: string;
  userEmail: string;
  now?: Date;
}): Promise<AcceptGroupInviteResult> {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const db = getDatabase();
  const [, accepted, member] = (await db.batch([
    db
      .update(groupInvites)
      .set({ status: "expired" })
      .where(
        and(
          eq(groupInvites.token, input.token),
          eq(groupInvites.status, "pending"),
          lte(groupInvites.expiresAt, now),
        ),
      ),
    db
      .update(groupInvites)
      .set({ status: "accepted" })
      .where(
        and(
          eq(groupInvites.token, input.token),
          eq(groupInvites.status, "pending"),
          gt(groupInvites.expiresAt, now),
          sql`(
            ${groupInvites.email} is null
            or lower(${groupInvites.email}) = lower(${input.userEmail})
          )`,
        ),
      ),
    db
      .insert(groupMembers)
      .select(
        sql`
          select ${groupInvites.groupId}, ${input.userId}, 'member', 1, ${nowMs}
          from ${groupInvites}
          where ${groupInvites.token} = ${input.token}
            and ${groupInvites.status} = 'accepted'
            and changes() = 1
        `,
      )
      .onConflictDoNothing({
        target: [groupMembers.groupId, groupMembers.userId],
      }),
  ])) as unknown as [RunMeta, RunMeta, RunMeta];

  if (changedRows(accepted) === 1) {
    if (changedRows(member) === 0) {
      await db
        .insert(groupMembers)
        .select(
          sql`
            select ${groupInvites.groupId}, ${input.userId}, 'member', 1, ${nowMs}
            from ${groupInvites}
            where ${groupInvites.token} = ${input.token}
              and ${groupInvites.status} = 'accepted'
          `,
        )
        .onConflictDoNothing({
          target: [groupMembers.groupId, groupMembers.userId],
        });
    }
    const [groupRow] = await db
      .select({ slug: groups.slug })
      .from(groupInvites)
      .innerJoin(groups, eq(groups.id, groupInvites.groupId))
      .where(eq(groupInvites.token, input.token))
      .limit(1);
    if (!groupRow) return { ok: false, reason: "not_found" };
    return { ok: true, groupSlug: groupRow.slug };
  }

  const [invite] = await db
    .select()
    .from(groupInvites)
    .where(eq(groupInvites.token, input.token))
    .limit(1);
  if (!invite || invite.status === "revoked" || invite.status === "accepted") {
    return { ok: false, reason: "not_found" };
  }
  if (
    invite.status === "expired" ||
    invite.expiresAt.getTime() <= now.getTime()
  ) {
    return { ok: false, reason: "expired" };
  }
  if (
    invite.email &&
    invite.email.toLowerCase() !== input.userEmail.toLowerCase()
  ) {
    return { ok: false, reason: "email_mismatch" };
  }
  return { ok: false, reason: "not_found" };
}
