import "server-only";

import { randomUUID } from "node:crypto";
import { isDatabaseConfigured, getDatabase } from "@/db/client";
import { seedConfiguredTeams } from "@/db/seed";
import {
  acquireRefreshLease,
  completeRefreshLease,
  getStoredTeamMetadata,
  persistSoccerTeamData,
  readStoredSchedule,
  readStoredSnapshot,
} from "@/data/soccer-repository";
import { createEvidenceBriefing } from "@/lib/briefing";
import {
  gameScheduleSchema,
  type GameDetailData,
  type GameSchedule,
  type TeamSlug,
} from "@/lib/contracts";
import {
  generateGames,
  getDemoBriefing,
  getSnapshot,
  getTeam,
  teams,
} from "@/lib/seed";
import {
  FootballDataClient,
  ProviderError,
} from "@/providers/football-data/client";
import {
  normalizeSoccerTeamData,
  SOCCER_PROVIDER_IDS,
} from "@/providers/football-data/normalize";
import type { FootballDataTeam } from "@/providers/football-data/schemas";

type SoccerSlug = keyof typeof SOCCER_PROVIDER_IDS;

export type DashboardData = Record<TeamSlug, GameSchedule>;

function isSoccerSlug(slug: TeamSlug | string): slug is SoccerSlug {
  return slug === "real-madrid" || slug === "barcelona";
}

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

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function cachedProviderTeam(
  slug: SoccerSlug,
  row: Awaited<ReturnType<typeof getStoredTeamMetadata>>,
): FootballDataTeam | undefined {
  if (!row || row.expiresAt <= new Date()) return undefined;
  return {
    id: SOCCER_PROVIDER_IDS[slug],
    name: row.canonical.name,
    shortName: row.canonical.shortName,
    tla: row.canonical.abbreviation,
    crest: row.canonical.crestUrl,
    lastUpdated: row.sourceObservedAt.toISOString(),
  };
}

function logIngestion(details: Record<string, unknown>) {
  console.info(JSON.stringify({ event: "soccer_ingestion", ...details }));
}

let inProcessRefresh: Promise<boolean> | undefined;

async function performSoccerRefresh(requestId: string, now = new Date()) {
  if (!isDatabaseConfigured() || !process.env.FOOTBALL_DATA_API_TOKEN?.trim()) {
    return false;
  }

  await seedConfiguredTeams(getDatabase(), now);
  const lease = await acquireRefreshLease(requestId, now);
  if (!lease) return false;

  try {
    const client = new FootballDataClient();
    const standings = await client.getLaLigaStandings();
    let refreshed = 0;
    let firstError: unknown;

    for (const slug of Object.keys(SOCCER_PROVIDER_IDS) as SoccerSlug[]) {
      const startedAt = Date.now();
      try {
        const providerId = SOCCER_PROVIDER_IDS[slug];
        const storedTeam = await getStoredTeamMetadata(slug);
        const cachedTeam = cachedProviderTeam(slug, storedTeam);
        const team = cachedTeam ?? (await client.getTeam(providerId));
        const metadataRefreshed = !cachedTeam;
        const dateTo = new Date(now);
        dateTo.setUTCFullYear(dateTo.getUTCFullYear() + 1);
        const [upcoming, recent] = await Promise.all([
          client.getTeamMatches(providerId, "upcoming_matches", {
            dateFrom: formatDate(now),
            dateTo: formatDate(dateTo),
            limit: "50",
          }),
          client.getTeamMatches(providerId, "recent_matches", {
            status: "FINISHED",
            limit: "20",
          }),
        ]);
        const data = normalizeSoccerTeamData({
          slug,
          team,
          upcoming: upcoming.matches,
          recent: recent.matches,
          standings,
          fetchedAt: now,
        });
        await persistSoccerTeamData({
          data,
          providerExternalId: String(providerId),
          metadataRefreshed,
          metadataObservedAt: new Date(team.lastUpdated ?? now),
          fetchedAt: now,
        });
        refreshed += 1;
        logIngestion({
          requestId,
          provider: "football-data",
          operation: "refresh_team",
          scope: slug,
          status: "succeeded",
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        firstError ??= error;
        logIngestion({
          requestId,
          provider: "football-data",
          operation: "refresh_team",
          scope: slug,
          status: "failed",
          errorCode:
            error instanceof ProviderError ? error.code : "persistence_error",
          durationMs: Date.now() - startedAt,
        });
      }
    }

    if (firstError) throw firstError;
    await completeRefreshLease({
      ...lease,
      status: "succeeded",
      cacheResult: "refreshed",
    });
    return refreshed > 0;
  } catch (error) {
    const errorCode =
      error instanceof ProviderError ? error.code : "persistence_error";
    await completeRefreshLease({
      ...lease,
      status: "failed",
      cacheResult: "stale",
      errorCode,
      errorMessage:
        error instanceof Error ? error.message : "Soccer refresh failed",
    });
    logIngestion({
      requestId,
      provider: "football-data",
      operation: "refresh_soccer",
      scope: "configured-teams",
      status: "failed",
      errorCode,
      durationMs: Date.now() - lease.startedAt.getTime(),
    });
    return false;
  }
}

export function refreshSoccerData(requestId = randomUUID(), now = new Date()) {
  inProcessRefresh ??= performSoccerRefresh(requestId, now).finally(() => {
    inProcessRefresh = undefined;
  });
  return inProcessRefresh;
}

async function storedSchedule(slug: SoccerSlug, now: Date) {
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
  if (
    !isSoccerSlug(slug) ||
    process.env.MATCHDAY_DATA_MODE?.toLowerCase() === "demo"
  ) {
    return demoSchedule(slug, now);
  }

  const cached = await storedSchedule(slug, now);
  if (cached?.freshness.mode === "live" && !options.forceRefresh) return cached;

  try {
    await refreshSoccerData(randomUUID(), now);
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

  let snapshot;
  try {
    snapshot = await readStoredSnapshot(gameId, now);
  } catch {
    snapshot = undefined;
  }
  if (!snapshot || snapshot.freshness.mode === "stale") {
    try {
      await refreshSoccerData(randomUUID(), now);
      snapshot = (await readStoredSnapshot(gameId, now)) ?? snapshot;
    } catch {
      // Preserve a stale snapshot when refresh or persistence fails.
    }
  }
  if (!snapshot) return undefined;
  const team = getTeam(snapshot.game.teamSlug)!;
  return { snapshot, briefing: createEvidenceBriefing(snapshot, team) };
}

export function getConfiguredTeams() {
  return teams;
}
