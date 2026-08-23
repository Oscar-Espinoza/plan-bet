import "server-only";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { utcDayEnd, utcDayStart } from "@/data/briefings-repository";
import { withDatabaseTransaction, getDatabase } from "@/db/client";
import { buddyMessages, buddyNotes } from "@/db/schema";

export const BUDDY_SESSION_DAILY_LIMIT = 30;
export const BUDDY_IP_DAILY_LIMIT = 100;

export type BuddyTurnClaim =
  | { allowed: true; id: string; remaining: number; resetAt: Date }
  | { allowed: false; remaining: 0; resetAt: Date };

/**
 * Same shape as claimBriefingSlot: advisory locks in a fixed order (session,
 * then IP — classids 6 and 7, the next feature after this claims 8) around a
 * count-then-insert in one transaction, so concurrent turns from the same
 * session or IP can't both slip under the limit. A chat turn is cheaper than
 * a full briefing generation, hence the higher daily caps.
 */
export async function claimBuddyTurn(input: {
  conversation: string;
  userId?: string;
  sessionHash: string;
  ipHash: string;
  route: string;
  text: string;
  now?: Date;
}): Promise<BuddyTurnClaim> {
  const now = input.now ?? new Date();
  const dayStart = utcDayStart(now);
  const resetAt = utcDayEnd(now);

  return withDatabaseTransaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(6, hashtext(${input.sessionHash}))`,
    );
    await transaction.execute(
      sql`select pg_advisory_xact_lock(7, hashtext(${input.ipHash}))`,
    );

    const [sessionCount] = await transaction
      .select({ used: sql<number>`count(*)::int` })
      .from(buddyMessages)
      .where(
        and(
          eq(buddyMessages.sessionHash, input.sessionHash),
          eq(buddyMessages.role, "user"),
          gte(buddyMessages.createdAt, dayStart),
        ),
      );
    const [ipCount] = await transaction
      .select({ used: sql<number>`count(*)::int` })
      .from(buddyMessages)
      .where(
        and(
          eq(buddyMessages.ipHash, input.ipHash),
          eq(buddyMessages.role, "user"),
          gte(buddyMessages.createdAt, dayStart),
        ),
      );

    const sessionUsed = sessionCount?.used ?? 0;
    const ipUsed = ipCount?.used ?? 0;
    if (
      sessionUsed >= BUDDY_SESSION_DAILY_LIMIT ||
      ipUsed >= BUDDY_IP_DAILY_LIMIT
    ) {
      return { allowed: false, remaining: 0, resetAt } as const;
    }

    const [row] = await transaction
      .insert(buddyMessages)
      .values({
        conversation: input.conversation,
        userId: input.userId,
        sessionHash: input.sessionHash,
        ipHash: input.ipHash,
        role: "user",
        text: input.text,
        route: input.route,
        status: "ok",
        createdAt: now,
      })
      .returning({ id: buddyMessages.id });

    return {
      allowed: true,
      id: row!.id,
      remaining: Math.max(0, BUDDY_SESSION_DAILY_LIMIT - sessionUsed - 1),
      resetAt,
    } as const;
  });
}

export async function recordBuddyReply(input: {
  conversation: string;
  userId?: string;
  sessionHash: string;
  ipHash: string;
  route: string;
  text: string;
  factIds: string[];
  pickId?: string;
  status: "ok" | "rejected" | "failed";
  reason?: string;
}) {
  await getDatabase().insert(buddyMessages).values({
    conversation: input.conversation,
    userId: input.userId,
    sessionHash: input.sessionHash,
    ipHash: input.ipHash,
    role: "buddy",
    text: input.text,
    route: input.route,
    factIds: input.factIds,
    pickId: input.pickId,
    status: input.status,
    reason: input.reason,
  });
}

/** Most recent first, so the freshest six are what carries into the prompt. */
export async function listBuddyNotes(sessionHash: string, limit = 6) {
  const rows = await getDatabase()
    .select({ note: buddyNotes.note })
    .from(buddyNotes)
    .where(eq(buddyNotes.sessionHash, sessionHash))
    .orderBy(desc(buddyNotes.createdAt))
    .limit(limit);
  return rows.map((row) => row.note);
}

export async function saveBuddyNote(input: {
  userId?: string;
  sessionHash: string;
  note: string;
}) {
  const existing = await getDatabase()
    .select({ id: buddyNotes.id })
    .from(buddyNotes)
    .where(
      and(
        eq(buddyNotes.sessionHash, input.sessionHash),
        eq(buddyNotes.note, input.note),
      ),
    )
    .limit(1);
  if (existing.length > 0) return;

  await getDatabase().insert(buddyNotes).values({
    userId: input.userId,
    sessionHash: input.sessionHash,
    note: input.note,
  });
}

export async function deleteBuddyNotes(sessionHash: string) {
  await getDatabase()
    .delete(buddyNotes)
    .where(eq(buddyNotes.sessionHash, sessionHash));
}
