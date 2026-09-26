import "server-only";
import { invalidatePublicSports } from "@/data/public-cache";

import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  not,
  or,
  sql,
} from "drizzle-orm";
import {
  notifyGroupSettlements,
  type SettledGroupWager,
} from "@/data/group-notifications";
import {
  acquireRefreshLease,
  applyGameUpdates,
  completeRefreshLease,
} from "@/data/sports-repository";
import { getDatabase } from "@/db/client";
import { creditEntries, games, wagers } from "@/db/schema";
import { gameSummarySchema, type Sport } from "@/lib/contracts";
import { logEvent } from "@/lib/logger";
import { gradeSelection, resolveSelection, type Grade } from "@/lib/markets";
import { TERMINAL_STATUSES } from "@/providers/contracts";
import { providerErrorCode } from "@/providers/provider-error";
import { getSportsProvider } from "@/providers/registry";

const DEFAULT_SETTLEMENT_LIMIT = 200;
// Pages per run: rows that fail stay open, and paging past them keeps them
// from starving every wager behind them without making one run unbounded.
const MAX_SETTLEMENT_PAGES = 5;
// Open-wager games re-read by id per sport per run, least recently fetched
// first, so the set rotates when there are more than this.
const RECONCILE_LIMIT = 50;
const SPORTS: Sport[] = ["soccer", "baseball"];

const gameStatus = sql<string>`${games.summary}->>'status'`;
const isTerminal = inArray(gameStatus, [...TERMINAL_STATUSES]);

/**
 * Re-reads, by provider game ID, every game that still has an open wager, has
 * passed its kickoff, and is not yet terminal. The team refresh only covers
 * the five upcoming fixtures and a seven-day result window, so a missed final
 * or a late cancellation would otherwise leave the wager open forever. A
 * provider failure is logged and settlement carries on with what is stored —
 * it never overwrites last-known-good.
 */
async function reconcileOpenFixtures(requestId: string, now: Date) {
  const database = getDatabase();
  for (const sport of SPORTS) {
    const provider = getSportsProvider(sport);
    if (!provider.isConfigured()) continue;
    const startedAt = Date.now();
    try {
      const open = await database
        .selectDistinct({
          externalId: games.externalId,
          fetchedAt: games.fetchedAt,
        })
        .from(games)
        .innerJoin(wagers, eq(wagers.canonicalGameId, games.canonicalId))
        .leftJoin(
          creditEntries,
          and(
            eq(creditEntries.wagerId, wagers.id),
            eq(creditEntries.kind, "return"),
          ),
        )
        .where(
          and(
            eq(games.provider, provider.provider),
            isNull(creditEntries.id),
            lte(games.scheduledAt, now),
            not(isTerminal),
          ),
        )
        .orderBy(asc(games.fetchedAt))
        .limit(RECONCILE_LIMIT);
      if (!open.length) continue;
      const updates = await provider.fetchGameUpdates({
        providerGameIds: open.map((row) => row.externalId),
        now,
      });
      const updated = await applyGameUpdates({
        provider: provider.provider,
        updates,
        fetchedAt: now,
      });
      logEvent("info", "sports_ingestion", {
        requestId,
        sport,
        provider: provider.provider,
        operation: "reconcile_open_fixtures",
        status: "succeeded",
        requested: open.length,
        updated,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      logEvent("warn", "sports_ingestion", {
        requestId,
        sport,
        provider: provider.provider,
        operation: "reconcile_open_fixtures",
        status: "failed",
        errorCode: providerErrorCode(error),
        durationMs: Date.now() - startedAt,
      });
    }
  }
}

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
 * Grades every open wager whose game has a terminal status and credits the
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
  // Why rows stayed open, by code only — they are retried next run, and this
  // is what makes a row that can never settle visible in the log.
  const failures: Record<string, number> = {};
  const fail = (code: string) => {
    counts.failed += 1;
    failures[code] = (failures[code] ?? 0) + 1;
  };
  // Only wagers this run actually paid (the insert won the unique index), so
  // a re-run over already-settled wagers never re-notifies.
  const notifiable: SettledGroupWager[] = [];

  try {
    await reconcileOpenFixtures(input.requestId, now);

    const database = getDatabase();
    let cursor: { scheduledAt: Date; id: string } | undefined;
    for (let page = 0; page < MAX_SETTLEMENT_PAGES; page += 1) {
      // Left join to the return row (is null = still open), inner join to
      // games on the canonical game ID: a wager whose game row is gone is
      // simply not a candidate, never guessed. Only terminal games are
      // candidates, filtered before the limit, and the keyset cursor pages
      // past rows that fail, so neither can crowd out a gradable wager.
      const candidates = await database
        .select({
          id: wagers.id,
          userId: wagers.userId,
          groupId: wagers.groupId,
          sport: wagers.sport,
          marketId: wagers.marketId,
          selectionId: wagers.selectionId,
          selectionLabel: wagers.selectionLabel,
          matchup: wagers.matchup,
          stake: wagers.stake,
          potentialReturn: wagers.potentialReturn,
          scheduledAt: wagers.scheduledAt,
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
        .where(
          and(
            isNull(creditEntries.id),
            isTerminal,
            cursor
              ? or(
                  gt(wagers.scheduledAt, cursor.scheduledAt),
                  and(
                    eq(wagers.scheduledAt, cursor.scheduledAt),
                    gt(wagers.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(asc(wagers.scheduledAt), asc(wagers.id))
        .limit(limit);

      for (const candidate of candidates) {
        try {
          const parsed = gameSummarySchema.safeParse(candidate.summary);
          if (!parsed.success) {
            fail("invalid_summary");
            continue;
          }
          const summary = parsed.data;

          // Defence in depth over the SQL filter: only a provider-confirmed
          // final or a called-off game grades. A score on a scheduled, live,
          // or unknown game is not proof it ended, so it stays open.
          if (!TERMINAL_STATUSES.includes(summary.status)) {
            counts.skipped += 1;
            continue;
          }

          const resolved = resolveSelection(
            candidate.sport,
            candidate.marketId,
            candidate.selectionId,
          );
          if (!resolved) {
            fail("unresolvable_selection");
            continue;
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
            if (candidate.groupId) {
              notifiable.push({
                groupId: candidate.groupId,
                userId: candidate.userId,
                matchup: candidate.matchup,
                selectionLabel: candidate.selectionLabel,
                outcome: grade,
                returned: amount,
              });
            }
          } else {
            // credit_entries_wager_return_uidx already had a row: a previous
            // run (or a concurrent one) already paid this wager.
            counts.skipped += 1;
          }
        } catch {
          // One wager's failure must never stop the rest of the run.
          fail("settle_error");
        }
      }

      const last = candidates.at(-1);
      if (!last || candidates.length < limit) break;
      cursor = { scheduledAt: last.scheduledAt, id: last.id };
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
  logEvent(runError || counts.failed ? "warn" : "info", "wager_settlement", {
    requestId: input.requestId,
    runId: lease.id,
    ...counts,
    failures,
  });

  if (counts.settled) invalidatePublicSports();
  if (runError) throw runError;

  // Sent after the lease is released, so a slow mail provider never holds the
  // settlement lease open. One digest per member per run, not per wager.
  await notifyGroupSettlements(notifiable);

  return { ok: true, runId: lease.id, ...counts };
}
