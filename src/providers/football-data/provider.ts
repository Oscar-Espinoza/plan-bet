import "server-only";

import type { TeamSlug } from "@/lib/contracts";
import type {
  CachedTeamMetadata,
  ProviderRefreshFailure,
  SportsProvider,
} from "@/providers/contracts";
import { FootballDataClient } from "@/providers/football-data/client";
import {
  FOOTBALL_DATA_PROVIDER,
  normalizeSoccerTeamData,
  SOCCER_PROVIDER_IDS,
} from "@/providers/football-data/normalize";
import type { FootballDataTeam } from "@/providers/football-data/schemas";
import { providerErrorCode } from "@/providers/provider-error";

type SoccerSlug = keyof typeof SOCCER_PROVIDER_IDS;

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function cachedProviderTeam(
  slug: SoccerSlug,
  cached: CachedTeamMetadata | undefined,
): FootballDataTeam | undefined {
  if (!cached) return undefined;
  return {
    id: SOCCER_PROVIDER_IDS[slug],
    name: cached.team.name,
    shortName: cached.team.shortName,
    tla: cached.team.abbreviation,
    crest: cached.team.crestUrl,
    lastUpdated: cached.sourceObservedAt.toISOString(),
  };
}

export class FootballDataProvider implements SportsProvider {
  readonly sport = "soccer" as const;
  readonly provider = FOOTBALL_DATA_PROVIDER;
  readonly refreshOperation = "refresh_soccer";
  readonly refreshScope = "configured-teams";
  readonly teamSlugs = Object.keys(SOCCER_PROVIDER_IDS) as SoccerSlug[];

  isConfigured() {
    return Boolean(process.env.FOOTBALL_DATA_API_TOKEN?.trim());
  }

  async refresh(input: {
    now: Date;
    cachedTeams: Partial<Record<TeamSlug, CachedTeamMetadata>>;
  }) {
    const client = new FootballDataClient();
    const standings = await client.getLaLigaStandings();
    const bundles = [];
    const failures: ProviderRefreshFailure[] = [];

    for (const slug of this.teamSlugs) {
      try {
        const providerId = SOCCER_PROVIDER_IDS[slug];
        const cachedTeam = cachedProviderTeam(slug, input.cachedTeams[slug]);
        const team = cachedTeam ?? (await client.getTeam(providerId));
        const dateTo = new Date(input.now);
        dateTo.setUTCFullYear(dateTo.getUTCFullYear() + 1);
        const [upcoming, recent] = await Promise.all([
          client.getTeamMatches(providerId, "upcoming_matches", {
            dateFrom: formatDate(input.now),
            dateTo: formatDate(dateTo),
            limit: "50",
          }),
          client.getTeamMatches(providerId, "recent_matches", {
            status: "FINISHED",
            limit: "20",
          }),
        ]);
        const normalized = normalizeSoccerTeamData({
          slug,
          team,
          upcoming: upcoming.matches,
          recent: recent.matches,
          standings,
          fetchedAt: input.now,
        });
        bundles.push({
          provider: this.provider,
          providerExternalId: String(providerId),
          metadataRefreshed: !cachedTeam,
          metadataObservedAt: new Date(team.lastUpdated ?? input.now),
          schedule: normalized.schedule,
          snapshots: normalized.snapshots,
        });
      } catch (error) {
        failures.push({ teamSlug: slug, code: providerErrorCode(error) });
      }
    }

    return { bundles, failures };
  }
}
