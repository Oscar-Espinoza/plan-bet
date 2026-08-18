import "server-only";

import type { TeamSlug } from "@/lib/contracts";
import { BaseballSavantClient } from "@/providers/baseball-savant/client";
import type {
  CachedTeamMetadata,
  ProviderDiagnostic,
  ProviderRefreshFailure,
  SportsProvider,
} from "@/providers/contracts";
import { MlbStatsClient } from "@/providers/mlb-stats/client";
import {
  BASEBALL_SAVANT_PROVIDER,
  MLB_PROVIDER_IDS,
  MLB_STATS_PROVIDER,
  normalizeBaseballTeamData,
  normalizeMlbStatus,
} from "@/providers/mlb-stats/normalize";
import type {
  MlbScheduleGame,
  MlbTeam,
  SavantExpectedTeamRow,
} from "@/providers/mlb-stats/schemas";
import { ProviderError, providerErrorCode } from "@/providers/provider-error";

type BaseballSlug = keyof typeof MLB_PROVIDER_IDS;

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function endOfYear(year: number) {
  return `${year}-12-31`;
}

function cachedProviderTeam(
  slug: BaseballSlug,
  cached: CachedTeamMetadata | undefined,
): MlbTeam | undefined {
  if (!cached) return undefined;
  return {
    id: MLB_PROVIDER_IDS[slug],
    name: cached.team.name,
    teamName: cached.team.shortName,
    shortName: cached.team.shortName,
    abbreviation: cached.team.abbreviation,
    fileCode: cached.team.abbreviation.toLowerCase(),
  };
}

function flattenGames(response: { dates: { games: MlbScheduleGame[] }[] }) {
  return response.dates.flatMap((date) => date.games);
}

function upcomingCount(games: MlbScheduleGame[]) {
  return games.filter((game) =>
    ["scheduled", "live", "postponed", "unknown"].includes(
      normalizeMlbStatus(game.status),
    ),
  ).length;
}

export class MlbSportsProvider implements SportsProvider {
  readonly sport = "baseball" as const;
  readonly provider = MLB_STATS_PROVIDER;
  readonly refreshOperation = "refresh_baseball";
  readonly refreshScope = "configured-teams";
  readonly teamSlugs = Object.keys(MLB_PROVIDER_IDS) as BaseballSlug[];

  constructor(
    private readonly mlb = new MlbStatsClient(),
    private readonly savant = new BaseballSavantClient(),
  ) {}

  isConfigured() {
    return true;
  }

  private async loadStatcast(now: Date): Promise<{
    rows: SavantExpectedTeamRow[];
    diagnostic: ProviderDiagnostic;
  }> {
    const currentSeason = now.getUTCFullYear();
    try {
      let rows = await this.savant.getExpectedTeamStats(currentSeason);
      if (!rows.length) {
        rows = await this.savant.getExpectedTeamStats(currentSeason - 1);
      }
      return {
        rows,
        diagnostic: {
          provider: BASEBALL_SAVANT_PROVIDER,
          operation: "expected_statistics",
          status: "succeeded",
        },
      };
    } catch (error) {
      return {
        rows: [],
        diagnostic: {
          provider: BASEBALL_SAVANT_PROVIDER,
          operation: "expected_statistics",
          status: "failed",
          code: error instanceof ProviderError ? error.code : "invalid_payload",
          message:
            error instanceof Error
              ? error.message
              : "Baseball Savant refresh failed",
        },
      };
    }
  }

  async refresh(input: {
    now: Date;
    cachedTeams: Partial<Record<TeamSlug, CachedTeamMetadata>>;
  }) {
    const season = input.now.getUTCFullYear();
    const standings = await this.mlb.getStandings(season);
    const statcast = await this.loadStatcast(input.now);
    const bundles = [];
    const failures: ProviderRefreshFailure[] = [];

    for (const slug of this.teamSlugs) {
      try {
        const teamId = MLB_PROVIDER_IDS[slug];
        const cachedTeam = cachedProviderTeam(slug, input.cachedTeams[slug]);
        const teamResponse = cachedTeam
          ? undefined
          : await this.mlb.getTeam(teamId, season);
        const team = cachedTeam ?? teamResponse?.teams[0];
        if (!team) {
          throw new ProviderError(
            "invalid_payload",
            "MLB team metadata was empty",
            "team_metadata",
          );
        }

        const currentSchedule = await this.mlb.getSchedule({
          teamId,
          season,
          startDate: formatDate(input.now),
          endDate: endOfYear(season),
          operation: "upcoming_schedule",
        });
        let upcoming = flattenGames(currentSchedule);
        if (upcomingCount(upcoming) < 5) {
          const nextSeason = season + 1;
          const nextSchedule = await this.mlb.getSchedule({
            teamId,
            season: nextSeason,
            startDate: `${nextSeason}-01-01`,
            endDate: endOfYear(nextSeason),
            operation: "upcoming_schedule",
          });
          upcoming = [...upcoming, ...flattenGames(nextSchedule)];
        }
        const recentStart = new Date(input.now);
        recentStart.setUTCDate(recentStart.getUTCDate() - 60);
        const recentResponse = await this.mlb.getSchedule({
          teamId,
          season,
          startDate: formatDate(recentStart),
          endDate: formatDate(input.now),
          operation: "recent_results",
        });
        const pitcherIds = [...upcoming]
          .sort((a, b) => a.gameDate.localeCompare(b.gameDate))
          .slice(0, 5)
          .flatMap((game) => [
            game.teams.home.probablePitcher?.id,
            game.teams.away.probablePitcher?.id,
          ])
          .filter((id): id is number => id != null);
        const pitchers = await this.mlb.getPitchers(pitcherIds, season);
        const normalized = normalizeBaseballTeamData({
          slug,
          team,
          upcoming,
          recent: flattenGames(recentResponse),
          standings,
          pitchers: pitchers.people,
          statcastRows: statcast.rows,
          fetchedAt: input.now,
        });
        bundles.push({
          provider: this.provider,
          providerExternalId: String(teamId),
          metadataRefreshed: !cachedTeam,
          metadataObservedAt: input.now,
          schedule: normalized.schedule,
          snapshots: normalized.snapshots,
        });
      } catch (error) {
        failures.push({ teamSlug: slug, code: providerErrorCode(error) });
      }
    }

    return {
      bundles,
      failures,
      diagnostics: [statcast.diagnostic],
    };
  }
}
