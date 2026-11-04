import { env } from "cloudflare:workers";
import { createHash, createHmac } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDatabase } from "../db/client";
import { buddyMessages, buddyNotes } from "../db/schema";
import { providerEnv } from "../providers/worker-env";

export const BUDDY_SESSION_DAILY_LIMIT = 30;
export const BUDDY_IP_DAILY_LIMIT = 100;

export function hashSessionId(sessionId: string) {
  return createHash("sha256").update(`session:${sessionId}`).digest("hex");
}

/**
 * Salted hash of CF-Connecting-IP. Null when RATE_LIMIT_HASH_SECRET is
 * missing: the caller must not claim a turn, and a raw IP is never stored.
 */
export function hashClientAddress(address: string): string | null {
  const secret = providerEnv("RATE_LIMIT_HASH_SECRET");
  if (!secret) return null;
  return createHmac("sha256", secret).update(address).digest("hex");
}

export function utcDayStart(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function utcDayEnd(now: Date) {
  return new Date(utcDayStart(now).getTime() + 24 * 60 * 60 * 1000);
}

export type BuddyTurnClaim =
  | { allowed: true; id: string; remaining: number; resetAt: Date }
  | { allowed: false; remaining: 0; resetAt: Date };

/**
 * One conditional insert replaces advisory locks 6 and 7. The row exists
 * only when this session is under 30 user turns today and this IP hash is
 * under 100. Claimed means `meta.changes === 1`. No count is read before
 * the insert; the WHERE is the quota.
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
  const id = crypto.randomUUID();
  const database = env.DB;
  if (!database) throw new Error("DB binding is not configured");

  const result = await database
    .prepare(
      `INSERT INTO buddy_messages (
         id, conversation, user_id, session_hash, ip_hash, role, text, route,
         fact_ids, status, created_at
       )
       SELECT ?1, ?2, ?3, ?4, ?5, 'user', ?6, ?7, json_array(), 'ok', ?8
       WHERE (
         SELECT count(*) FROM buddy_messages
         WHERE session_hash = ?4 AND role = 'user' AND created_at >= ?9
       ) < ?10
       AND (
         SELECT count(*) FROM buddy_messages
         WHERE ip_hash = ?5 AND role = 'user' AND created_at >= ?9
       ) < ?11`,
    )
    .bind(
      id,
      input.conversation,
      input.userId ?? null,
      input.sessionHash,
      input.ipHash,
      input.text,
      input.route,
      now.getTime(),
      dayStart.getTime(),
      BUDDY_SESSION_DAILY_LIMIT,
      BUDDY_IP_DAILY_LIMIT,
    )
    .run();

  if (result.meta.changes !== 1) {
    return { allowed: false, remaining: 0, resetAt };
  }

  // Display only. The insert already decided the claim.
  let remaining = Math.max(0, BUDDY_SESSION_DAILY_LIMIT - 1);
  try {
    const [row] = await getDatabase()
      .select({ used: sql<number>`count(*)`.mapWith(Number) })
      .from(buddyMessages)
      .where(
        and(
          eq(buddyMessages.sessionHash, input.sessionHash),
          eq(buddyMessages.role, "user"),
          gte(buddyMessages.createdAt, dayStart),
        ),
      );
    remaining = Math.max(0, BUDDY_SESSION_DAILY_LIMIT - (row?.used ?? 1));
  } catch {
    remaining = 0;
  }

  return { allowed: true, id, remaining, resetAt };
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
