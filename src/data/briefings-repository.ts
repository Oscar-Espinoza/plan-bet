import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDatabase, withDatabaseTransaction } from "@/db/client";
import { briefingRuns } from "@/db/schema";
import type { Briefing, Sport } from "@/lib/contracts";

export const SESSION_DAILY_LIMIT = 5;
export const IP_DAILY_LIMIT = 20;

// ponytail: a per-process salt when RATE_LIMIT_HASH_SECRET is unset. Raw IPs are
// still never stored, but IP quotas reset on redeploy — set the secret in
// production to make them stable.
const FALLBACK_SALT = randomUUID();

export function hashSessionId(sessionId: string) {
  return createHash("sha256").update(`session:${sessionId}`).digest("hex");
}

export function hashClientAddress(address: string) {
  const secret = process.env.RATE_LIMIT_HASH_SECRET?.trim() || FALLBACK_SALT;
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

export type BriefingSlot =
  | {
      allowed: true;
      id: string;
      startedAt: Date;
      remaining: number;
      resetAt: Date;
    }
  | { allowed: false; remaining: 0; resetAt: Date };

/**
 * Reserves one generation against both daily quotas and returns the run row it
 * inserted. Counting and inserting happen inside one transaction guarded by
 * advisory locks taken in a fixed order (session first, then IP), so concurrent
 * requests serialize and neither quota can be exceeded.
 *
 * ponytail: advisory locks plus a count over briefing_runs, rather than a second
 * counter table. Ceiling is one lock round-trip per request; move to a
 * (hash, day, count) upsert table if generation volume ever makes that matter.
 */
export async function claimBriefingSlot(input: {
  routeId: string;
  sport: Sport;
  sessionHash: string;
  ipHash: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  inputHash: string;
  snapshotObservedAt?: Date;
  requestId: string;
  now?: Date;
}): Promise<BriefingSlot> {
  const now = input.now ?? new Date();
  const dayStart = utcDayStart(now);
  const resetAt = utcDayEnd(now);

  return withDatabaseTransaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(1, hashtext(${input.sessionHash}))`,
    );
    await transaction.execute(
      sql`select pg_advisory_xact_lock(2, hashtext(${input.ipHash}))`,
    );

    const [sessionCount] = await transaction
      .select({ used: sql<number>`count(*)::int` })
      .from(briefingRuns)
      .where(
        and(
          eq(briefingRuns.sessionHash, input.sessionHash),
          gte(briefingRuns.startedAt, dayStart),
        ),
      );
    const [ipCount] = await transaction
      .select({ used: sql<number>`count(*)::int` })
      .from(briefingRuns)
      .where(
        and(
          eq(briefingRuns.ipHash, input.ipHash),
          gte(briefingRuns.startedAt, dayStart),
        ),
      );

    const sessionUsed = sessionCount?.used ?? 0;
    const ipUsed = ipCount?.used ?? 0;
    if (sessionUsed >= SESSION_DAILY_LIMIT || ipUsed >= IP_DAILY_LIMIT) {
      return { allowed: false, remaining: 0, resetAt } as const;
    }

    const [row] = await transaction
      .insert(briefingRuns)
      .values({
        routeId: input.routeId,
        sport: input.sport,
        sessionHash: input.sessionHash,
        ipHash: input.ipHash,
        model: input.model,
        promptVersion: input.promptVersion,
        schemaVersion: input.schemaVersion,
        inputHash: input.inputHash,
        snapshotObservedAt: input.snapshotObservedAt,
        status: "running",
        requestId: input.requestId,
        startedAt: now,
      })
      .returning({ id: briefingRuns.id, startedAt: briefingRuns.startedAt });

    return {
      allowed: true,
      id: row!.id,
      startedAt: row!.startedAt,
      remaining: Math.max(0, SESSION_DAILY_LIMIT - sessionUsed - 1),
      resetAt,
    } as const;
  });
}

export async function completeBriefingRun(input: {
  id: string;
  startedAt: Date;
  status: "succeeded" | "failed";
  mode: "live" | "fallback";
  validationStatus: string;
  attemptCount: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostMicros?: number;
  errorCode?: string;
  output?: Briefing;
}) {
  const completedAt = new Date();
  await getDatabase()
    .update(briefingRuns)
    .set({
      status: input.status,
      mode: input.mode,
      validationStatus: input.validationStatus,
      attemptCount: input.attemptCount,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      estimatedCostMicros: input.estimatedCostMicros,
      errorCode: input.errorCode,
      output: input.output,
      completedAt,
      latencyMs: Math.max(0, completedAt.getTime() - input.startedAt.getTime()),
    })
    .where(eq(briefingRuns.id, input.id));
}
