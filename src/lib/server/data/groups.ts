import { and, eq, gt, isNull, sql } from "drizzle-orm";
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
    const nowMs = Date.now();
    const [inserted, member] = (await db.batch([
      db.run(sql`
        insert into groups (id, name, slug, created_by_user_id, created_at)
        values (${id}, ${input.name}, ${slug}, ${input.userId}, ${nowMs})
        on conflict (slug) do nothing
      `),
      db.run(sql`
        insert into group_members (
          group_id, user_id, role, notify_on_activity, joined_at
        )
        select ${id}, ${input.userId}, 'owner', 1, ${nowMs}
        where exists (select 1 from groups where id = ${id})
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
    db.run(sql`
      insert into group_invites (
        id, group_id, email, token, invited_by_user_id, status, created_at, expires_at
      )
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
        select 1 from group_members
        where group_id = ${input.groupId}
          and user_id = ${input.invitedByUserId}
      )
      and not exists (
        select 1 from "user" u
        inner join group_members m on m.user_id = u.id
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
 * One pending link invite per group. The partial unique index is the lock:
 * a concurrent insert either no-ops on conflict or loses the transaction,
 * then both callers read the single pending row.
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
      db.run(sql`
        update group_invites
        set status = 'expired'
        where group_id = ${input.groupId}
          and email is null
          and status = 'pending'
          and expires_at <= ${nowMs}
      `),
      db.run(sql`
        insert into group_invites (
          id, group_id, email, token, invited_by_user_id, status, created_at, expires_at
        )
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
          select 1 from group_members
          where group_id = ${input.groupId}
            and user_id = ${input.userId}
        )
        and not exists (
          select 1 from group_invites
          where group_id = ${input.groupId}
            and email is null
            and status = 'pending'
            and expires_at > ${nowMs}
        )
        on conflict (group_id) where "group_invites"."email" is null
          and "group_invites"."status" = 'pending' do nothing
      `),
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
    db.run(sql`
      update group_invites
      set status = 'revoked'
      where id = ${input.inviteId}
        and group_id = ${input.groupId}
        and status = 'pending'
        and exists (
          select 1 from group_members
          where group_id = ${input.groupId}
            and user_id = ${input.userId}
        )
    `),
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
    db.run(sql`
      update group_invites
      set status = 'expired'
      where token = ${input.token}
        and status = 'pending'
        and expires_at <= ${nowMs}
    `),
    db.run(sql`
      update group_invites
      set status = 'accepted'
      where token = ${input.token}
        and status = 'pending'
        and expires_at > ${nowMs}
        and (
          email is null
          or lower(email) = lower(${input.userEmail})
        )
    `),
    db.run(sql`
      insert into group_members (
        group_id, user_id, role, notify_on_activity, joined_at
      )
      select group_id, ${input.userId}, 'member', 1, ${nowMs}
      from group_invites
      where token = ${input.token}
        and status = 'accepted'
        and changes() = 1
      on conflict (group_id, user_id) do nothing
    `),
  ])) as unknown as [RunMeta, RunMeta, RunMeta];

  if (changedRows(accepted) === 1) {
    if (changedRows(member) === 0) {
      await db.run(sql`
        insert into group_members (
          group_id, user_id, role, notify_on_activity, joined_at
        )
        select group_id, ${input.userId}, 'member', 1, ${nowMs}
        from group_invites
        where token = ${input.token}
          and status = 'accepted'
        on conflict (group_id, user_id) do nothing
      `);
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
