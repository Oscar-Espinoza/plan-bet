import "server-only";

import { randomUUID } from "node:crypto";
import { unstable_cache, revalidateTag } from "next/cache";
import { after } from "next/server";
import { isDatabaseConfigured, getDatabase } from "@/db/client";
import { seedConfiguredTeams } from "@/db/seed";
import { readFixtureContext } from "@/data/fixture-context-repository";
import { withContextFacts } from "@/data/fixture-facts";
import {
  acquireRefreshLease,
  completeRefreshLease,
  getStoredTeamMetadata,
  persistSportsTeamData,
  readStoredSchedule,
  readStoredSnapshot,
  recordProviderDiagnostic,
} from "@/data/sports-repository";
import {
  gameScheduleSchema,
  type GameDetailData,
  type GameSchedule,
  type Sport,
  type TeamSlug,
} from "@/lib/contracts";
import { logEvent } from "@/lib/logger";
import { generateGames, getSnapshot, getTeam, teams } from "@/lib/seed";
import type { CachedTeamMetadata } from "@/providers/contracts";
import { providerErrorCode } from "@/providers/provider-error";
import { getSportsProvider } from "@/providers/registry";

export type DashboardData = Record<TeamSlug, GameSchedule>;

export type RefreshOutcome = {
  sport: Sport;
  provider: string;
  status: "succeeded" | "failed" | "skipped";
  reason?: "unconfigured" | "locked";
  errorCode?: string;
  refreshed: number;
  durationMs: number;
};

function demoSchedule(slug: TeamSlug, now = new Date()) {
  const team = getTeam(slug)!;
  const games = generateGames(slug, now);
  const snapshot = getSnapshot(games[0]!.id, now)!;
  return gameScheduleSchema.parse({
    team,
    games,
    context: snapshot.context,
    freshness: snapshot.freshness,
  });
}

function logIngestion(
  level: "info" | "warn",
  details: Record<string, unknown>,
) {
  logEvent(level, "sports_ingestion", details);
}

const inProcessRefresh = new Map<Sport, Promise<RefreshOutcome>>();

export const DASHBOARD_TAG = "dashboard";

// after() and revalidateTag() throw outside a request context (CLI, tests).
function refreshInBackground(sport: Sport, requestId: string, now: Date) {
  const run = () => refreshSportData(sport, requestId, now).catch(() => {});
  try {
    after(run);
  } catch {
    void run();
  }
}

function invalidateDashboard() {
  try {
    revalidateTag(DASHBOARD_TAG, "max");
  } catch {}
}

async function cachedMetadata(
  sport: Sport,
  now: Date,
): Promise<Partial<Record<TeamSlug, CachedTeamMetadata>>> {
  const provider = getSportsProvider(sport);
  const cached: Partial<Record<TeamSlug, CachedTeamMetadata>> = {};
  for (const slug of provider.teamSlugs) {
    const row = await getStoredTeamMetadata(slug);
    if (row && row.provider === provider.provider && row.expiresAt > now) {
      cached[slug] = {
        team: row.canonical,
        providerExternalId: row.externalId,
        sourceObservedAt: row.sourceObservedAt,
        expiresAt: row.expiresAt,
      };
    }
  }
  return cached;
}

async function performSportRefresh(
  sport: Sport,
  requestId: string,
  now = new Date(),
): Promise<RefreshOutcome> {
  const refreshStartedAt = Date.now();
  const provider = getSportsProvider(sport);
  if (!isDatabaseConfigured() || !provider.isConfigured()) {
    return {
      sport,
      provider: provider.provider,
      status: "skipped",
      reason: "unconfigured",
      refreshed: 0,
      durationMs: Date.now() - refreshStartedAt,
    };
  }

  await seedConfiguredTeams(getDatabase(), now);
  const lease = await acquireRefreshLease({
    provider: provider.provider,
    operation: provider.refreshOperation,
    scope: provider.refreshScope,
    requestId,
    now,
  });
  if (!lease) {
    return {
      sport,
      provider: provider.provider,
      status: "skipped",
      reason: "locked",
      refreshed: 0,
      durationMs: Date.now() - refreshStartedAt,
    };
  }

  const startedAt = Date.now();
  try {
    const result = await provider.refresh({
      now,
      cachedTeams: await cachedMetadata(sport, now),
    });
    const failures = [...result.failures];
    let refreshed = 0;
    for (const bundle of result.bundles) {
      try {
        await persistSportsTeamData({ bundle, fetchedAt: now });
        refreshed += 1;
        logIngestion("info", {
          requestId,
          sport,
          provider: provider.provider,
          operation: "refresh_team",
          scope: bundle.schedule.team.slug,
          status: "succeeded",
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        const errorCode = providerErrorCode(error);
        failures.push({
          teamSlug: bundle.schedule.team.slug,
          code: errorCode,
        });
        logIngestion("warn", {
          requestId,
          sport,
          provider: provider.provider,
          operation: "refresh_team",
          scope: bundle.schedule.team.slug,
          status: "failed",
          errorCode,
          durationMs: Date.now() - startedAt,
        });
      }
    }
    for (const diagnostic of result.diagnostics ?? []) {
      await recordProviderDiagnostic({
        ...diagnostic,
        scope: provider.refreshScope,
        requestId,
        errorCode: diagnostic.code,
        errorMessage: diagnostic.message,
        now,
      });
    }
    const failure = failures[0];
    await completeRefreshLease({
      ...lease,
      status: failure ? "failed" : "succeeded",
      cacheResult: refreshed ? "refreshed" : "stale",
      errorCode: failure?.code,
      errorMessage: failure ? `${sport} refresh was incomplete` : undefined,
    });
    logIngestion(failure ? "warn" : "info", {
      requestId,
      sport,
      provider: provider.provider,
      operation: provider.refreshOperation,
      scope: provider.refreshScope,
      status: failure ? "failed" : "succeeded",
      errorCode: failure?.code,
      refreshed,
      durationMs: Date.now() - startedAt,
    });
    if (!failure && refreshed) invalidateDashboard();
    return {
      sport,
      provider: provider.provider,
      status: failure ? "failed" : "succeeded",
      errorCode: failure?.code,
      refreshed,
      durationMs: Date.now() - refreshStartedAt,
    };
  } catch (error) {
    const errorCode = providerErrorCode(error);
    await completeRefreshLease({
      ...lease,
      status: "failed",
      cacheResult: "stale",
      errorCode,
      errorMessage:
        error instanceof Error ? error.message : `${sport} refresh failed`,
    });
    logIngestion("warn", {
      requestId,
      sport,
      provider: provider.provider,
      operation: provider.refreshOperation,
      scope: provider.refreshScope,
      status: "failed",
      errorCode,
      durationMs: Date.now() - startedAt,
    });
    return {
      sport,
      provider: provider.provider,
      status: "failed",
      errorCode,
      refreshed: 0,
      durationMs: Date.now() - refreshStartedAt,
    };
  }
}

export function refreshSportData(
  sport: Sport,
  requestId: string = randomUUID(),
  now = new Date(),
) {
  const running = inProcessRefresh.get(sport);
  if (running) return running;
  const refresh = performSportRefresh(sport, requestId, now).finally(() => {
    inProcessRefresh.delete(sport);
  });
  inProcessRefresh.set(sport, refresh);
  return refresh;
}

export function refreshSoccerData(requestId = randomUUID(), now = new Date()) {
  return refreshSportData("soccer", requestId, now);
}

export function refreshBaseballData(
  requestId = randomUUID(),
  now = new Date(),
) {
  return refreshSportData("baseball", requestId, now);
}

async function storedSchedule(slug: TeamSlug, now: Date) {
  try {
    return await readStoredSchedule(slug, now);
  } catch {
    return undefined;
  }
}

export async function getTeamSchedule(
  slug: TeamSlug,
  options: { now?: Date; forceRefresh?: boolean; requestId?: string } = {},
) {
  const now = options.now ?? new Date();
  const requestId = options.requestId ?? randomUUID();
  const team = getTeam(slug)!;
  if (process.env.MATCHDAY_DATA_MODE?.toLowerCase() === "demo") {
    return demoSchedule(slug, now);
  }

  const cached = await storedSchedule(slug, now);
  // Stale renders now, refresh goes out of band. Only a cold cache waits.
  if (cached && !options.forceRefresh) {
    if (cached.freshness.mode !== "live") {
      refreshInBackground(team.sport, requestId, now);
    }
    return cached;
  }

  try {
    await refreshSportData(team.sport, requestId, now);
  } catch {
    // A database/provider failure must not prevent stale or demo fallback.
  }
  const refreshed = await storedSchedule(slug, now);
  return refreshed ?? cached ?? demoSchedule(slug, now);
}

export async function getDashboardData(
  options: { now?: Date; requestId?: string } = {},
) {
  const now = options.now ?? new Date();
  const requestId = options.requestId ?? randomUUID();
  const entries = await Promise.all(
    teams.map(async (team) => {
      const schedule = await getTeamSchedule(team.slug, { now, requestId });
      // Board shows the next match only; providers still persist five.
      return [team.slug, { ...schedule, games: schedule.games.slice(0, 1) }];
    }),
  );
  return Object.fromEntries(entries) as DashboardData;
}

// Zero-arg on purpose: the per-call requestId would key every entry uniquely.
const cachedDashboard = unstable_cache(
  () => getDashboardData(),
  ["dashboard"],
  {
    revalidate: 3600,
    tags: [DASHBOARD_TAG],
  },
);

export function getCachedDashboardData() {
  // Demo data is in-memory and date-relative: nothing to save, and caching it
  // would un-anchor the Playwright board.
  return process.env.MATCHDAY_DATA_MODE?.toLowerCase() === "demo"
    ? getDashboardData()
    : cachedDashboard();
}

async function storedSnapshot(gameId: string, now: Date) {
  try {
    return await readStoredSnapshot(gameId, now);
  } catch {
    return undefined;
  }
}

export async function getGameDetail(
  gameId: string,
  options: { now?: Date; requestId?: string } = {},
): Promise<GameDetailData | undefined> {
  const now = options.now ?? new Date();
  const requestId = options.requestId ?? randomUUID();
  const demoSnapshot = getSnapshot(gameId, now);
  if (demoSnapshot) return { snapshot: demoSnapshot };
  if (process.env.MATCHDAY_DATA_MODE?.toLowerCase() === "demo")
    return undefined;

  let snapshot = await storedSnapshot(gameId, now);
  if (snapshot?.freshness.mode === "stale") {
    // Same rule as the schedule read above.
    refreshInBackground(snapshot.game.sport, requestId, now);
  } else if (!snapshot) {
    for (const sport of ["soccer", "baseball"] as const) {
      await refreshSportData(sport, requestId, now).catch(() => undefined);
      snapshot = await storedSnapshot(gameId, now);
      if (snapshot) break;
    }
  }
  if (!snapshot) return undefined;
  // Stored fixture context is a bonus, never a dependency: no database, no row,
  // or a row written in a shape the contract has since moved past all leave the
  // snapshot exactly as it was. Merged here rather than in any one consumer so
  // the page and the buddy read the same facts.
  if (isDatabaseConfigured()) {
    const stored = await readFixtureContext(gameId).catch(() => undefined);
    if (stored) snapshot = withContextFacts(snapshot, stored.facts);
  }
  return { snapshot };
}

export function getConfiguredTeams() {
  return teams;
}
