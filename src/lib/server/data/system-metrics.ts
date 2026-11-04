import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Sport } from "../domain/contracts";
import { modeForExpiry } from "../domain/cache-policy";
import { getDatabase, isDatabaseConfigured } from "../db/client";
import { creditEntries, ingestionRuns, teams, wagers } from "../db/schema";

const DEFAULT_LIMIT = 10;
const MIN_LIMIT = 1;
const MAX_LIMIT = 10;
const DEFAULT_WINDOW_HOURS = 24;

export type SystemMetrics =
  | {
      available: true;
      generatedAt: string;
      windowHours: number;
      limit: number;
      ingestion: {
        recent: {
          provider: string;
          operation: string;
          scope: string;
          status: "running" | "succeeded" | "failed";
          cacheResult: string | null;
          errorCode: string | null;
          durationMs: number | null;
          startedAt: string;
          completedAt: string | null;
        }[];
        byProvider: {
          provider: string;
          total: number;
          succeeded: number;
          failed: number;
          lastRunAt: string | null;
          lastSuccessAt: string | null;
        }[];
      };
      settlement: {
        lastRunAt: string | null;
        lastSuccessAt: string | null;
        status: "running" | "succeeded" | "failed" | null;
        byOutcome: { won: number; lost: number; void: number };
        oldestOpenWagerAt: string | null;
      };
      freshness: {
        sport: Sport;
        provider: string;
        mode: "live" | "stale";
        scheduleFetchedAt: string | null;
        scheduleExpiresAt: string | null;
      }[];
    }
  | { available: false; reason: "unconfigured" | "unavailable" };

function clampLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(limit)));
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

export async function getSystemMetrics(
  options: { limit?: number; windowHours?: number; now?: Date } = {},
): Promise<SystemMetrics> {
  if (!isDatabaseConfigured())
    return { available: false, reason: "unconfigured" };

  const limit = clampLimit(options.limit);
  const windowHours = options.windowHours ?? DEFAULT_WINDOW_HOURS;
  const now = options.now ?? new Date();
  const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

  try {
    const database = getDatabase();

    const recentRunsQuery = database
      .select({
        provider: ingestionRuns.provider,
        operation: ingestionRuns.operation,
        scope: ingestionRuns.scope,
        status: ingestionRuns.status,
        cacheResult: ingestionRuns.cacheResult,
        errorCode: ingestionRuns.errorCode,
        durationMs: ingestionRuns.durationMs,
        startedAt: ingestionRuns.startedAt,
        completedAt: ingestionRuns.completedAt,
      })
      .from(ingestionRuns)
      .orderBy(desc(ingestionRuns.startedAt))
      .limit(limit);

    const byProviderQuery = database
      .select({
        provider: ingestionRuns.provider,
        total: sql<number>`count(*)`.mapWith(Number),
        succeeded:
          sql<number>`count(*) filter (where ${ingestionRuns.status} = 'succeeded')`.mapWith(
            Number,
          ),
        failed:
          sql<number>`count(*) filter (where ${ingestionRuns.status} = 'failed')`.mapWith(
            Number,
          ),
        lastRunAt: sql<string | null>`max(${ingestionRuns.startedAt})`,
        lastSuccessAt: sql<
          string | null
        >`max(${ingestionRuns.startedAt}) filter (where ${ingestionRuns.status} = 'succeeded')`,
      })
      .from(ingestionRuns)
      .where(gte(ingestionRuns.startedAt, windowStart))
      .groupBy(ingestionRuns.provider);

    const teamRowsQuery = database
      .select({
        sport: teams.sport,
        provider: teams.provider,
        scheduleFetchedAt: teams.scheduleFetchedAt,
        scheduleExpiresAt: teams.scheduleExpiresAt,
      })
      .from(teams);

    const settlementLatestQuery = database
      .select({
        status: ingestionRuns.status,
        startedAt: ingestionRuns.startedAt,
      })
      .from(ingestionRuns)
      .where(eq(ingestionRuns.provider, "settlement"))
      .orderBy(desc(ingestionRuns.startedAt))
      .limit(1);

    const settlementSuccessQuery = database
      .select({
        lastSuccessAt: sql<string | null>`max(${ingestionRuns.startedAt})`,
      })
      .from(ingestionRuns)
      .where(
        and(
          eq(ingestionRuns.provider, "settlement"),
          eq(ingestionRuns.status, "succeeded"),
        ),
      );

    const settlementOutcomeQuery = database
      .select({
        won: sql<number>`count(*) filter (where ${creditEntries.outcome} = 'won')`.mapWith(
          Number,
        ),
        lost: sql<number>`count(*) filter (where ${creditEntries.outcome} = 'lost')`.mapWith(
          Number,
        ),
        voided:
          sql<number>`count(*) filter (where ${creditEntries.outcome} = 'void')`.mapWith(
            Number,
          ),
      })
      .from(creditEntries)
      .where(
        and(
          eq(creditEntries.kind, "return"),
          gte(creditEntries.createdAt, windowStart),
        ),
      );

    const oldestOpenWagerQuery = database
      .select({
        oldestCreatedAt: sql<string | null>`min(${wagers.createdAt})`,
      })
      .from(wagers)
      .leftJoin(
        creditEntries,
        and(
          eq(creditEntries.wagerId, wagers.id),
          eq(creditEntries.kind, "return"),
        ),
      )
      .where(isNull(creditEntries.id));

    const [
      recentRuns,
      byProviderRows,
      teamRows,
      [settlementLatest],
      [settlementSuccess],
      [settlementOutcome],
      [oldestOpenWager],
    ] = await Promise.all([
      recentRunsQuery,
      byProviderQuery,
      teamRowsQuery,
      settlementLatestQuery,
      settlementSuccessQuery,
      settlementOutcomeQuery,
      oldestOpenWagerQuery,
    ]);

    const freshestBySport = new Map<Sport, (typeof teamRows)[number]>();
    for (const row of teamRows) {
      const current = freshestBySport.get(row.sport);
      const rowFetchedAt = row.scheduleFetchedAt?.getTime() ?? 0;
      const currentFetchedAt = current?.scheduleFetchedAt?.getTime() ?? 0;
      if (!current || rowFetchedAt > currentFetchedAt) {
        freshestBySport.set(row.sport, row);
      }
    }

    return {
      available: true,
      generatedAt: now.toISOString(),
      windowHours,
      limit,
      ingestion: {
        recent: recentRuns.map((run) => ({
          provider: run.provider,
          operation: run.operation,
          scope: run.scope,
          status: run.status,
          cacheResult: run.cacheResult,
          errorCode: run.errorCode,
          durationMs: run.durationMs,
          startedAt: toIso(run.startedAt)!,
          completedAt: toIso(run.completedAt),
        })),
        byProvider: byProviderRows.map((row) => ({
          provider: row.provider,
          total: toNumber(row.total),
          succeeded: toNumber(row.succeeded),
          failed: toNumber(row.failed),
          lastRunAt: toIso(row.lastRunAt),
          lastSuccessAt: toIso(row.lastSuccessAt),
        })),
      },
      settlement: {
        lastRunAt: toIso(settlementLatest?.startedAt),
        lastSuccessAt: toIso(settlementSuccess?.lastSuccessAt),
        status: settlementLatest?.status ?? null,
        byOutcome: {
          won: toNumber(settlementOutcome?.won),
          lost: toNumber(settlementOutcome?.lost),
          void: toNumber(settlementOutcome?.voided),
        },
        oldestOpenWagerAt: toIso(oldestOpenWager?.oldestCreatedAt),
      },
      freshness: [...freshestBySport.entries()].map(([sport, row]) => ({
        sport,
        provider: row.provider,
        mode: modeForExpiry(toIso(row.scheduleExpiresAt) ?? undefined, now),
        scheduleFetchedAt: toIso(row.scheduleFetchedAt),
        scheduleExpiresAt: toIso(row.scheduleExpiresAt),
      })),
    };
  } catch {
    return { available: false, reason: "unavailable" };
  }
}
