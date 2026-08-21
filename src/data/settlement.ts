import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import {
  acquireRefreshLease,
  completeRefreshLease,
} from "@/data/sports-repository";
import { getDatabase } from "@/db/client";
import { creditEntries, games, wagers } from "@/db/schema";
import { gameSummarySchema } from "@/lib/contracts";
import { logEvent } from "@/lib/logger";
import { gradeSelection, resolveSelection, type Grade } from "@/lib/markets";

const DEFAULT_SETTLEMENT_LIMIT = 200;

/** won -> the frozen potential return, void -> the stake back, lost -> 0. */
export function gradeCredits(
  grade: Grade,
  wager: { potentialReturn: number; stake: number },
): number {
  switch (grade) {
    case "won":
      return wager.potentialReturn;
    case "void":
      return wager.stake;
    case "lost":
      return 0;
  }
}

export type SettlementCounts = {
  settled: number;
  skipped: number;
  failed: number;
  byOutcome: { won: number; lost: number; void: number };
};

export type SettlementRunResult =
  | ({ ok: true; runId: string } & SettlementCounts)
  | { ok: false; reason: "locked" };

/**
 * Grades every open wager whose game has a stored result and credits the
 * return exactly once. Reuses the sports-refresh ingestion lease
 * (`ingestion_runs`, provider "settlement") so a stalled run cannot
 * double-pay — a lease that fails to claim (another run in flight, or a
 * concurrent claim wins the race) returns `{ ok: false, reason: "locked" }`
 * without ever selecting a candidate, never queued behind.
 *
 * ponytail: each wager settles via one `INSERT ... ON CONFLICT DO NOTHING`
 * on `getDatabase()` — already atomic per statement — rather than a
 * `withDatabaseTransaction` (a fresh Pool) per wager. Upgrade to a real
 * per-wager transaction only if settlement ever needs more than one
 * statement per wager.
 */
export async function settleWagers(input: {
  requestId: string;
  now?: Date;
  limit?: number;
}): Promise<SettlementRunResult> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? DEFAULT_SETTLEMENT_LIMIT;

  const lease = await acquireRefreshLease({
    provider: "settlement",
    operation: "settle",
    scope: "all",
    requestId: input.requestId,
    now,
  });
  if (!lease) return { ok: false, reason: "locked" };

  const counts: SettlementCounts = {
    settled: 0,
    skipped: 0,
    failed: 0,
    byOutcome: { won: 0, lost: 0, void: 0 },
  };
  let runError: unknown;

  try {
    const database = getDatabase();
    // Left join to the return row (is null = still open), inner join to
    // games on the canonical game ID: a wager whose game row is gone is
    // simply not a candidate, never guessed.
    const candidates = await database
      .select({
        id: wagers.id,
        userId: wagers.userId,
        sport: wagers.sport,
        marketId: wagers.marketId,
        selectionId: wagers.selectionId,
        stake: wagers.stake,
        potentialReturn: wagers.potentialReturn,
        summary: games.summary,
      })
      .from(wagers)
      .leftJoin(
        creditEntries,
        and(
          eq(creditEntries.wagerId, wagers.id),
          eq(creditEntries.kind, "return"),
        ),
      )
      .innerJoin(games, eq(wagers.canonicalGameId, games.canonicalId))
      .where(isNull(creditEntries.id))
      .orderBy(asc(wagers.scheduledAt))
      .limit(limit);

    for (const candidate of candidates) {
      try {
        const summary = gameSummarySchema.parse(candidate.summary);

        // A game still scheduled/live with no result yet is left open, not
        // guessed and not voided — gradeSelection would otherwise treat a
        // missing result as void regardless of status.
        if (
          (summary.status === "scheduled" || summary.status === "live") &&
          !summary.result
        ) {
          counts.skipped += 1;
          continue;
        }

        const resolved = resolveSelection(
          candidate.sport,
          candidate.marketId,
          candidate.selectionId,
        );
        if (!resolved) {
          throw new Error("Unresolvable market/selection for wager");
        }

        const grade = gradeSelection(
          resolved.market,
          candidate.selectionId,
          summary,
        );
        const amount = gradeCredits(grade, candidate);

        const [inserted] = await database
          .insert(creditEntries)
          .values({
            userId: candidate.userId,
            kind: "return",
            amount,
            reason: "wager settled",
            wagerId: candidate.id,
            outcome: grade,
            settlementRunId: lease.id,
          })
          .onConflictDoNothing()
          .returning({ id: creditEntries.id });

        if (inserted) {
          counts.settled += 1;
          counts.byOutcome[grade] += 1;
        } else {
          // credit_entries_wager_return_uidx already had a row: a previous
          // run (or a concurrent one) already paid this wager.
          counts.skipped += 1;
        }
      } catch {
        // One wager's failure must never stop the rest of the run.
        counts.failed += 1;
      }
    }
  } catch (error) {
    runError = error;
  } finally {
    await completeRefreshLease({
      id: lease.id,
      startedAt: lease.startedAt,
      status: runError ? "failed" : "succeeded",
      errorCode: runError ? "settlement_run_failed" : undefined,
      errorMessage: runError
        ? runError instanceof Error
          ? runError.message
          : "settlement run failed"
        : JSON.stringify(counts),
    });
  }

  // No user id, wager id, matchup, or secret — counts only, same shape as
  // the existing sports_ingestion log.
  logEvent(runError ? "warn" : "info", "wager_settlement", {
    requestId: input.requestId,
    runId: lease.id,
    ...counts,
  });

  if (runError) throw runError;

  return { ok: true, runId: lease.id, ...counts };
}
