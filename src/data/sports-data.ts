import "server-only";

import { randomUUID } from "node:crypto";
import { isDatabaseConfigured, getDatabase } from "@/db/client";
import { seedConfiguredTeams } from "@/db/seed";
import {
  acquireRefreshLease,
  completeRefreshLease,
  getStoredTeamMetadata,
  persistSportsTeamData,
  readStoredSchedule,
  readStoredSnapshot,
  recordProviderDiagnostic,
} from "@/data/sports-repository";
import { createEvidenceBriefing } from "@/lib/briefing";
import {
  gameScheduleSchema,
  type GameDetailData,
  type GameSchedule,
  type Sport,
  type TeamSlug,
} from "@/lib/contracts";
import {
  generateGames,
  getDemoBriefing,
  getSnapshot,
  getTeam,
  teams,
} from "@/lib/seed";
import type { CachedTeamMetadata } from "@/providers/contracts";
import { providerErrorCode } from "@/providers/provider-error";
import { getSportsProvider } from "@/providers/registry";

export type DashboardData = Record<TeamSlug, GameSchedule>;

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

function logIngestion(details: Record<string, unknown>) {
  console.info(JSON.stringify({ event: "sports_ingestion", ...details }));
}

const inProcessRefresh = new Map<Sport, Promise<boolean>>();

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
) {
  const provider = getSportsProvider(sport);
  if (!isDatabaseConfigured() || !provider.isConfigured()) return false;

  await seedConfiguredTeams(getDatabase(), now);
  const lease = await acquireRefreshLease({
    provider: provider.provider,
    operation: provider.refreshOperation,
    scope: provider.refreshScope,
    requestId,
    now,
  });
  if (!lease) return false;

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
        logIngestion({
          requestId,
          sport,
          provider: provider.provider,
          operation: "refresh_team",
          scope: bundle.schedule.team.slug,
          status: "succeeded",
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        failures.push({
          teamSlug: bundle.schedule.team.slug,
          code: providerErrorCode(error),
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
    logIngestion({
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
    return refreshed > 0;
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
    logIngestion({
      requestId,
      sport,
      provider: provider.provider,
      operation: provider.refreshOperation,
      scope: provider.refreshScope,
      status: "failed",
      errorCode,
      durationMs: Date.now() - startedAt,
    });
    return false;
  }
}

export function refreshSportData(
  sport: Sport,
  requestId = randomUUID(),
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
  options: { now?: Date; forceRefresh?: boolean } = {},
) {
  const now = options.now ?? new Date();
  const team = getTeam(slug)!;
  if (process.env.MATCHDAY_DATA_MODE?.toLowerCase() === "demo") {
    return demoSchedule(slug, now);
  }

  const cached = await storedSchedule(slug, now);
  if (cached?.freshness.mode === "live" && !options.forceRefresh) return cached;

  try {
    await refreshSportData(team.sport, randomUUID(), now);
  } catch {
    // A database/provider failure must not prevent stale or demo fallback.
  }
  const refreshed = await storedSchedule(slug, now);
  return refreshed ?? cached ?? demoSchedule(slug, now);
}

export async function getDashboardData(now = new Date()) {
  const schedules = {} as DashboardData;
  for (const team of teams) {
    schedules[team.slug] = await getTeamSchedule(team.slug, { now });
  }
  return schedules;
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
  now = new Date(),
): Promise<GameDetailData | undefined> {
  const demoSnapshot = getSnapshot(gameId, now);
  if (demoSnapshot) {
    return {
      snapshot: demoSnapshot,
      briefing: getDemoBriefing(gameId, now)!,
    };
  }
  if (process.env.MATCHDAY_DATA_MODE?.toLowerCase() === "demo")
    return undefined;

  let snapshot = await storedSnapshot(gameId, now);
  if (snapshot?.freshness.mode === "stale") {
    await refreshSportData(snapshot.game.sport, randomUUID(), now).catch(
      () => undefined,
    );
    snapshot = (await storedSnapshot(gameId, now)) ?? snapshot;
  } else if (!snapshot) {
    for (const sport of ["soccer", "baseball"] as const) {
      await refreshSportData(sport, randomUUID(), now).catch(() => undefined);
      snapshot = await storedSnapshot(gameId, now);
      if (snapshot) break;
    }
  }
  if (!snapshot) return undefined;
  const team = getTeam(snapshot.game.teamSlug)!;
  return { snapshot, briefing: createEvidenceBriefing(snapshot, team) };
}

export function getConfiguredTeams() {
  return teams;
}
