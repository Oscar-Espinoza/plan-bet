import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { withDatabaseTransaction } from "@/db/client";
import { groupInvites, groupMembers, groups, users } from "@/db/schema";
import {
  groupInviteSchema,
  groupSchema,
  type Group,
  type GroupInvite,
} from "@/lib/contracts";

const INVITE_TTL_DAYS = 7;

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
 * classid 5 (see CLAUDE.md's advisory-lock ledger — 1-4 are briefing quotas,
 * bankroll reset, and wager placement) keyed on the candidate slug, so two
 * concurrent creates for the same name cannot both win the same slug.
 */
export async function createGroup(input: {
  userId: string;
  name: string;
}): Promise<Group> {
  const base = slugify(input.name);

  return withDatabaseTransaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(5, hashtext(${base}))`,
    );

    let slug = base;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [existing] = await transaction
        .select({ id: groups.id })
        .from(groups)
        .where(eq(groups.slug, slug))
        .limit(1);
      if (!existing) break;
      slug = `${base}-${randomUUID().slice(0, 6)}`;
    }

    const [groupRow] = await transaction
      .insert(groups)
      .values({ name: input.name, slug, createdByUserId: input.userId })
      .returning();

    await transaction.insert(groupMembers).values({
      groupId: groupRow!.id,
      userId: input.userId,
      role: "owner",
    });

    return groupSchema.parse({
      id: groupRow!.id,
      name: groupRow!.name,
      slug: groupRow!.slug,
      createdByUserId: groupRow!.createdByUserId,
      createdAt: groupRow!.createdAt.toISOString(),
    });
  });
}

export type InviteToGroupResult =
  // `token` is deliberately outside `invite`: it is the secret that accepts
  // the invite, so it goes to the invitee's inbox and never into the
  // canonical GroupInvite shape an API response serializes.
  | { ok: true; invite: GroupInvite; token: string }
  | { ok: false; reason: "not_a_member" }
  | { ok: false; reason: "already_member" };

/**
 * Membership is re-checked here, not just at the route layer — the same
 * "never trust the caller" boundary placeWager applies to price.
 */
export async function inviteToGroup(input: {
  groupId: string;
  invitedByUserId: string;
  email: string;
  now?: Date;
}): Promise<InviteToGroupResult> {
  const now = input.now ?? new Date();
  const expiresAt = new Date(
    now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  return withDatabaseTransaction(async (transaction) => {
    const [membership] = await transaction
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, input.groupId),
          eq(groupMembers.userId, input.invitedByUserId),
        ),
      )
      .limit(1);
    if (!membership) return { ok: false, reason: "not_a_member" } as const;

    const [existingMember] = await transaction
      .select({ userId: users.id })
      .from(users)
      .innerJoin(groupMembers, eq(groupMembers.userId, users.id))
      .where(
        and(
          eq(groupMembers.groupId, input.groupId),
          eq(users.email, input.email),
        ),
      )
      .limit(1);
    if (existingMember) return { ok: false, reason: "already_member" } as const;

    const [inviteRow] = await transaction
      .insert(groupInvites)
      .values({
        groupId: input.groupId,
        email: input.email,
        token: randomUUID(),
        invitedByUserId: input.invitedByUserId,
        status: "pending",
        expiresAt,
      })
      .returning();

    return {
      ok: true,
      token: inviteRow!.token,
      invite: groupInviteSchema.parse({
        id: inviteRow!.id,
        groupId: inviteRow!.groupId,
        email: inviteRow!.email,
        status: inviteRow!.status,
        createdAt: inviteRow!.createdAt.toISOString(),
        expiresAt: inviteRow!.expiresAt.toISOString(),
      }),
    } as const;
  });
}

export type CreateJoinLinkResult =
  | { ok: true; invite: GroupInvite; token: string }
  | { ok: false; reason: "not_a_member" };

/**
 * A join link is a `group_invites` row with `email` null — nobody in
 * particular was invited, so accepting one skips the email match entirely.
 * One live link per group: a pending, unexpired link is reused rather than
 * minting a second one, so sharing the same URL twice from the Members card
 * still produces the same URL.
 */
export async function createJoinLink(input: {
  groupId: string;
  userId: string;
  now?: Date;
}): Promise<CreateJoinLinkResult> {
  const now = input.now ?? new Date();
  const expiresAt = new Date(
    now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  return withDatabaseTransaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(5, hashtext(${input.groupId}))`,
    );

    const [membership] = await transaction
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, input.groupId),
          eq(groupMembers.userId, input.userId),
        ),
      )
      .limit(1);
    if (!membership) return { ok: false, reason: "not_a_member" } as const;

    const [existing] = await transaction
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

    const inviteRow =
      existing ??
      (
        await transaction
          .insert(groupInvites)
          .values({
            groupId: input.groupId,
            email: null,
            token: randomUUID(),
            invitedByUserId: input.userId,
            status: "pending",
            expiresAt,
          })
          .returning()
      )[0];

    return {
      ok: true,
      token: inviteRow!.token,
      invite: groupInviteSchema.parse({
        id: inviteRow!.id,
        groupId: inviteRow!.groupId,
        email: inviteRow!.email,
        status: inviteRow!.status,
        createdAt: inviteRow!.createdAt.toISOString(),
        expiresAt: inviteRow!.expiresAt.toISOString(),
      }),
    } as const;
  });
}

export type RevokeInviteResult =
  { ok: true } | { ok: false; reason: "not_a_member" };

/**
 * Membership re-checked, same as every other group mutation here. Scoping
 * the update to `status = 'pending'` makes this idempotent by construction —
 * revoking twice, or revoking an already-accepted invite, is a no-op rather
 * than an error.
 */
export async function revokeInvite(input: {
  inviteId: string;
  groupId: string;
  userId: string;
}): Promise<RevokeInviteResult> {
  return withDatabaseTransaction(async (transaction) => {
    const [membership] = await transaction
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, input.groupId),
          eq(groupMembers.userId, input.userId),
        ),
      )
      .limit(1);
    if (!membership) return { ok: false, reason: "not_a_member" } as const;

    await transaction
      .update(groupInvites)
      .set({ status: "revoked" })
      .where(
        and(
          eq(groupInvites.id, input.inviteId),
          eq(groupInvites.groupId, input.groupId),
          eq(groupInvites.status, "pending"),
        ),
      );

    return { ok: true } as const;
  });
}

export type AcceptGroupInviteResult =
  | { ok: true; groupSlug: string }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "expired" }
  | { ok: false; reason: "email_mismatch" };

/**
 * classid 5, keyed on the invite token, so a double-click or a retried
 * request cannot accept the same invite twice concurrently.
 */
export async function acceptGroupInvite(input: {
  token: string;
  userId: string;
  userEmail: string;
  now?: Date;
}): Promise<AcceptGroupInviteResult> {
  const now = input.now ?? new Date();

  return withDatabaseTransaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(5, hashtext(${input.token}))`,
    );

    const [invite] = await transaction
      .select()
      .from(groupInvites)
      .where(eq(groupInvites.token, input.token))
      .limit(1);
    if (!invite || invite.status !== "pending") {
      return { ok: false, reason: "not_found" } as const;
    }
    if (invite.expiresAt.getTime() <= now.getTime()) {
      await transaction
        .update(groupInvites)
        .set({ status: "expired" })
        .where(eq(groupInvites.id, invite.id));
      return { ok: false, reason: "expired" } as const;
    }
    // A link invite (null email) has no email to mismatch.
    if (
      invite.email &&
      invite.email.toLowerCase() !== input.userEmail.toLowerCase()
    ) {
      return { ok: false, reason: "email_mismatch" } as const;
    }

    await transaction
      .insert(groupMembers)
      .values({ groupId: invite.groupId, userId: input.userId, role: "member" })
      .onConflictDoNothing();

    await transaction
      .update(groupInvites)
      .set({ status: "accepted" })
      .where(eq(groupInvites.id, invite.id));

    const [groupRow] = await transaction
      .select({ slug: groups.slug })
      .from(groups)
      .where(eq(groups.id, invite.groupId))
      .limit(1);

    return { ok: true, groupSlug: groupRow!.slug } as const;
  });
}
