import "server-only";

import { and, desc, gte, isNotNull, sql } from "drizzle-orm";
import { modeForExpiry } from "@/data/cache-policy";
import { getDatabase, isDatabaseConfigured } from "@/db/client";
import { briefingRuns, ingestionRuns, teams } from "@/db/schema";
import type { Sport } from "@/lib/contracts";

const DEFAULT_LIMIT = 10;
const MIN_LIMIT = 1;
const MAX_LIMIT = 10;
const DEFAULT_WINDOW_HOURS = 24;
const TOP_ERROR_CODES = 5;

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
      briefings: {
        total: number;
        succeeded: number;
        failed: number;
        running: number;
        live: number;
        fallback: number;
        retried: number;
        latencyMs: { p50: number; p95: number } | null;
        inputTokens: number;
        outputTokens: number;
        estimatedCostMicros: number;
        lastGenerationAt: string | null;
        errors: { code: string; count: number }[];
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

/**
 * The single read boundary for operational metrics — used by both
 * /api/system/recent and the /system page. Never throws: a dependency being
 * down must degrade the page, not blow it up. Every query is projected by
 * column and never touches session_hash, ip_hash, input_hash, or output, so
 * nothing returned can be used to enumerate an individual visitor.
 */
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
        total: sql<number>`count(*)`,
        succeeded: sql<number>`count(*) filter (where ${ingestionRuns.status} = 'succeeded')`,
        failed: sql<number>`count(*) filter (where ${ingestionRuns.status} = 'failed')`,
        lastRunAt: sql<string | null>`max(${ingestionRuns.startedAt})`,
        lastSuccessAt: sql<
          string | null
        >`max(${ingestionRuns.startedAt}) filter (where ${ingestionRuns.status} = 'succeeded')`,
      })
      .from(ingestionRuns)
      .where(gte(ingestionRuns.startedAt, windowStart))
      .groupBy(ingestionRuns.provider);

    const briefingAggQuery = database
      .select({
        total: sql<number>`count(*)`,
        succeeded: sql<number>`count(*) filter (where ${briefingRuns.status} = 'succeeded')`,
        failed: sql<number>`count(*) filter (where ${briefingRuns.status} = 'failed')`,
        running: sql<number>`count(*) filter (where ${briefingRuns.status} = 'running')`,
        live: sql<number>`count(*) filter (where ${briefingRuns.mode} = 'live')`,
        fallback: sql<number>`count(*) filter (where ${briefingRuns.mode} = 'fallback')`,
        retried: sql<number>`count(*) filter (where ${briefingRuns.attemptCount} > 1)`,
        p50: sql<
          number | null
        >`percentile_cont(0.5) within group (order by ${briefingRuns.latencyMs}) filter (where ${briefingRuns.latencyMs} is not null)`,
        p95: sql<
          number | null
        >`percentile_cont(0.95) within group (order by ${briefingRuns.latencyMs}) filter (where ${briefingRuns.latencyMs} is not null)`,
        inputTokens: sql<number | null>`sum(${briefingRuns.inputTokens})`,
        outputTokens: sql<number | null>`sum(${briefingRuns.outputTokens})`,
        estimatedCostMicros: sql<
          number | null
        >`sum(${briefingRuns.estimatedCostMicros})`,
        lastGenerationAt: sql<string | null>`max(${briefingRuns.startedAt})`,
      })
      .from(briefingRuns)
      .where(gte(briefingRuns.startedAt, windowStart));

    const errorRowsQuery = database
      .select({
        code: briefingRuns.errorCode,
        count: sql<number>`count(*)`,
      })
      .from(briefingRuns)
      .where(
        and(
          gte(briefingRuns.startedAt, windowStart),
          isNotNull(briefingRuns.errorCode),
        ),
      )
      .groupBy(briefingRuns.errorCode)
      .orderBy(sql`count(*) desc`)
      .limit(TOP_ERROR_CODES);

    const teamRowsQuery = database
      .select({
        sport: teams.sport,
        provider: teams.provider,
        scheduleFetchedAt: teams.scheduleFetchedAt,
        scheduleExpiresAt: teams.scheduleExpiresAt,
      })
      .from(teams);

    // Five independent reads; running them concurrently keeps /system and
    // /api/system/recent to one round-trip's latency instead of five.
    const [recentRuns, byProviderRows, [briefingAgg], errorRows, teamRows] =
      await Promise.all([
        recentRunsQuery,
        byProviderQuery,
        briefingAggQuery,
        errorRowsQuery,
        teamRowsQuery,
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
      briefings: {
        total: toNumber(briefingAgg?.total),
        succeeded: toNumber(briefingAgg?.succeeded),
        failed: toNumber(briefingAgg?.failed),
        running: toNumber(briefingAgg?.running),
        live: toNumber(briefingAgg?.live),
        fallback: toNumber(briefingAgg?.fallback),
        retried: toNumber(briefingAgg?.retried),
        latencyMs:
          briefingAgg?.p50 != null && briefingAgg?.p95 != null
            ? { p50: toNumber(briefingAgg.p50), p95: toNumber(briefingAgg.p95) }
            : null,
        inputTokens: toNumber(briefingAgg?.inputTokens),
        outputTokens: toNumber(briefingAgg?.outputTokens),
        estimatedCostMicros: toNumber(briefingAgg?.estimatedCostMicros),
        lastGenerationAt: toIso(briefingAgg?.lastGenerationAt),
        errors: errorRows
          .filter(
            (row): row is { code: string; count: number } => row.code != null,
          )
          .map((row) => ({ code: row.code, count: toNumber(row.count) })),
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
