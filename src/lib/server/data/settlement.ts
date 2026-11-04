import { env, waitUntil } from "cloudflare:workers";
import { and, asc, eq, gt, inArray, isNull, lte, not, or } from "drizzle-orm";
import { gameSummarySchema, type Sport } from "../domain/contracts";
import { logEvent } from "../logger";
import {
  gradeSelection,
  resolveSelection,
  type Grade,
} from "../../shared/markets";
import { getDatabase } from "../db/client";
import { creditEntries, games, wagers } from "../db/schema";
import { TERMINAL_STATUSES } from "../providers/contracts";
import { providerErrorCode } from "../providers/provider-error";
import { getSportsProvider } from "../providers/registry";
import {
  notifyGroupSettlements,
  type SettledGroupWager,
} from "./group-notifications";
import { publishReadModels } from "./publish";
import {
  acquireRefreshLease,
  applyGameUpdates,
  completeRefreshLease,
} from "./sports-repository";

const DEFAULT_SETTLEMENT_LIMIT = 200;
const MAX_SETTLEMENT_PAGES = 5;
const RECONCILE_LIMIT = 50;
const SPORTS: Sport[] = ["soccer", "baseball"];

const isTerminal = inArray(games.status, [...TERMINAL_STATUSES]);

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

async function insertReturnCredit(input: {
  userId: string;
  amount: number;
  wagerId: string;
  outcome: Grade;
  settlementRunId: string;
}): Promise<boolean> {
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const result = await env
    .DB!.prepare(
      `INSERT INTO credit_entries (id, user_id, kind, amount, reason, wager_id, outcome, settlement_run_id, created_at)
     VALUES (?1, ?2, 'return', ?3, 'wager settled', ?4, ?5, ?6, ?7)
     ON CONFLICT (wager_id) WHERE kind = 'return' DO NOTHING`,
    )
    .bind(
      id,
      input.userId,
      input.amount,
      input.wagerId,
      input.outcome,
      input.settlementRunId,
      createdAt,
    )
    .run();
  return result.meta.changes === 1;
}

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
  const failures: Record<string, number> = {};
  const fail = (code: string) => {
    counts.failed += 1;
    failures[code] = (failures[code] ?? 0) + 1;
  };
  const notifiable: SettledGroupWager[] = [];

  try {
    await reconcileOpenFixtures(input.requestId, now);

    const database = getDatabase();
    let cursor: { scheduledAt: Date; id: string } | undefined;
    for (let page = 0; page < MAX_SETTLEMENT_PAGES; page += 1) {
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

          const inserted = await insertReturnCredit({
            userId: candidate.userId,
            amount,
            wagerId: candidate.id,
            outcome: grade,
            settlementRunId: lease.id,
          });

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
            counts.skipped += 1;
          }
        } catch {
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

  logEvent(runError || counts.failed ? "warn" : "info", "wager_settlement", {
    requestId: input.requestId,
    runId: lease.id,
    ...counts,
    failures,
  });

  if (counts.settled) {
    waitUntil(publishReadModels().catch(() => undefined));
  }
  if (runError) throw runError;

  waitUntil(notifyGroupSettlements(notifiable));

  return { ok: true, runId: lease.id, ...counts };
}
