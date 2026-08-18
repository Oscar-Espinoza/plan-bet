import {
  briefingSchema,
  gameScheduleSchema,
  gameSnapshotSchema,
  gameStatusSchema,
  teamSchema,
  type Briefing,
  type Freshness,
  type GameStatus,
  type Team,
  type TeamSlug,
} from "@/lib/contracts";
import { createBriefingItem } from "@/lib/briefing";
import { getTeam } from "@/lib/seed";
import type {
  FootballDataMatch,
  FootballDataStandings,
  FootballDataTeam,
} from "@/providers/football-data/schemas";
import type { ProviderSnapshot } from "@/providers/contracts";

export const FOOTBALL_DATA_PROVIDER = "football-data";
export const FOOTBALL_DATA_ATTRIBUTION = {
  name: "football-data.org",
  url: "https://www.football-data.org/",
} as const;

export const SOCCER_PROVIDER_IDS = {
  "real-madrid": 86,
  barcelona: 81,
} as const satisfies Record<"real-madrid" | "barcelona", number>;

const TRACKED_SLUGS_BY_ID = new Map<number, TeamSlug>(
  Object.entries(SOCCER_PROVIDER_IDS).map(([slug, id]) => [
    id,
    slug as TeamSlug,
  ]),
);

export function normalizeFootballStatus(status: string): GameStatus {
  const normalized = status.toUpperCase();
  if (normalized === "SCHEDULED" || normalized === "TIMED") return "scheduled";
  if (["LIVE", "IN_PLAY", "PAUSED"].includes(normalized)) return "live";
  if (normalized === "FINISHED") return "finished";
  if (["POSTPONED", "SUSPENDED"].includes(normalized)) return "postponed";
  if (normalized === "CANCELLED") return "cancelled";
  return gameStatusSchema.parse("unknown");
}

function providerGameId(id: number) {
  return `football-data-${id}`;
}

function canonicalGameId(id: number, slug: TeamSlug) {
  return `${providerGameId(id)}-${slug}`;
}

function normalizeTeam(
  slug: "real-madrid" | "barcelona",
  raw: FootballDataTeam,
): Team {
  const configured = getTeam(slug)!;
  return teamSchema.parse({
    ...configured,
    abbreviation: raw.tla ?? configured.abbreviation,
    crestUrl: raw.crest ?? undefined,
    providerIds: {
      ...configured.providerIds,
      [FOOTBALL_DATA_PROVIDER]: String(raw.id),
    },
  });
}

function resultFor(match: FootballDataMatch, teamId: number) {
  const isHome = match.homeTeam.id === teamId;
  const score = match.score?.fullTime;
  if (score?.home == null || score.away == null) return undefined;
  const own = isHome ? score.home : score.away;
  const opponent = isHome ? score.away : score.home;
  return own === opponent ? "D" : own > opponent ? "W" : "L";
}

export type NormalizedSoccerTeamData = {
  schedule: ReturnType<typeof gameScheduleSchema.parse>;
  snapshots: ProviderSnapshot[];
  briefingByGame: Record<string, Briefing>;
};

export function normalizeSoccerTeamData(input: {
  slug: "real-madrid" | "barcelona";
  team: FootballDataTeam;
  upcoming: FootballDataMatch[];
  recent: FootballDataMatch[];
  standings: FootballDataStandings;
  fetchedAt: Date;
}): NormalizedSoccerTeamData {
  const { slug, fetchedAt } = input;
  const teamId = SOCCER_PROVIDER_IDS[slug];
  const team = normalizeTeam(slug, input.team);
  const standingsTable =
    input.standings.standings.find((entry) => entry.type === "TOTAL")?.table ??
    input.standings.standings[0]?.table ??
    [];
  const standing = standingsTable.find((row) => row.team.id === teamId);
  const recent = [...input.recent]
    .filter((match) => normalizeFootballStatus(match.status) === "finished")
    .sort((a, b) => b.utcDate.localeCompare(a.utcDate))
    .slice(0, 5);
  const recentForm = recent
    .map((match) => resultFor(match, teamId))
    .filter((result): result is "W" | "D" | "L" => Boolean(result));
  const context = {
    kind: "soccer" as const,
    tablePosition: standing?.position,
    points: standing?.points,
    record: standing
      ? `${standing.won}W · ${standing.draw}D · ${standing.lost}L`
      : undefined,
    recentForm,
    availability: [],
    matchupNotes: [],
  };
  const expiresAt = new Date(fetchedAt.getTime() + 60 * 60 * 1000);
  const scheduleExpiry = new Date(fetchedAt.getTime() + 6 * 60 * 60 * 1000);
  const freshness: Freshness = {
    mode: "live",
    provider: FOOTBALL_DATA_PROVIDER,
    sourceObservedAt: fetchedAt.toISOString(),
    fetchedAt: fetchedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    attribution: FOOTBALL_DATA_ATTRIBUTION,
  };
  const games = [...input.upcoming]
    .filter((match) =>
      ["scheduled", "live", "postponed"].includes(
        normalizeFootballStatus(match.status),
      ),
    )
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
    .slice(0, 5)
    .map((match) => ({
      id: canonicalGameId(match.id, slug),
      sport: "soccer" as const,
      teamSlug: slug,
      competition: match.competition.name,
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      homeTeamSlug: TRACKED_SLUGS_BY_ID.get(match.homeTeam.id),
      awayTeamSlug: TRACKED_SLUGS_BY_ID.get(match.awayTeam.id),
      scheduledAt: match.utcDate,
      venue: match.venue ?? undefined,
      status: normalizeFootballStatus(match.status),
    }));

  const snapshots: ProviderSnapshot[] = [];
  const briefingByGame: Record<string, Briefing> = {};
  for (const game of games) {
    const raw = input.upcoming.find(
      (match) => canonicalGameId(match.id, slug) === game.id,
    )!;
    const observedAt = raw.lastUpdated ?? fetchedAt.toISOString();
    const sourceIds = {
      schedule: `${game.id}-source-schedule`,
      standings: `${game.id}-source-standings`,
      form: `${game.id}-source-form`,
    };
    const sources = [
      {
        id: sourceIds.schedule,
        name: "football-data.org team matches",
        description: "Fixture time, competition, teams, status, and venue.",
        provider: FOOTBALL_DATA_PROVIDER,
        operation: "upcoming_matches",
        url: `https://api.football-data.org/v4/teams/${teamId}/matches`,
        observedAt,
      },
      {
        id: sourceIds.standings,
        name: "football-data.org La Liga standings",
        description: "Current total-table position, points, and record.",
        provider: FOOTBALL_DATA_PROVIDER,
        operation: "standings",
        url: "https://api.football-data.org/v4/competitions/PD/standings",
        observedAt: fetchedAt.toISOString(),
      },
      {
        id: sourceIds.form,
        name: "football-data.org completed matches",
        description:
          "Last five completed matches from the tracked team perspective.",
        provider: FOOTBALL_DATA_PROVIDER,
        operation: "recent_matches",
        url: `https://api.football-data.org/v4/teams/${teamId}/matches`,
        observedAt: recent[0]?.lastUpdated ?? fetchedAt.toISOString(),
      },
    ];
    const factPrefix = `${game.id}-fact`;
    const facts = [
      {
        id: `${factPrefix}-schedule`,
        label: "Scheduled time",
        value: game.scheduledAt,
        valueType: "datetime" as const,
        sourceId: sourceIds.schedule,
        observedAt,
      },
      {
        id: `${factPrefix}-competition`,
        label: "Competition",
        value: game.competition,
        sourceId: sourceIds.schedule,
        observedAt,
      },
      {
        id: `${factPrefix}-venue`,
        label: "Venue",
        value: game.venue ?? "Not provided",
        sourceId: sourceIds.schedule,
        observedAt,
      },
      {
        id: `${factPrefix}-standing`,
        label: "La Liga standing",
        value: standing
          ? `#${standing.position} · ${standing.points} pts · ${context.record}`
          : "Not provided",
        sourceId: sourceIds.standings,
        observedAt: fetchedAt.toISOString(),
      },
      {
        id: `${factPrefix}-form`,
        label: "Last five completed matches",
        value: recentForm.length ? recentForm.join(" · ") : "Not provided",
        sourceId: sourceIds.form,
        observedAt: recent[0]?.lastUpdated ?? fetchedAt.toISOString(),
      },
    ];
    const snapshot = gameSnapshotSchema.parse({
      game,
      context,
      sources,
      evidenceFacts: facts,
      freshness: { ...freshness, sourceObservedAt: observedAt },
    });
    snapshots.push({
      providerGameId: String(raw.id),
      canonicalGameId: providerGameId(raw.id),
      route: { id: game.id, teamSlug: slug },
      snapshot,
    });
    briefingByGame[game.id] = briefingSchema.parse({
      gameId: game.id,
      mode: "demo",
      summary: `A deterministic evidence review for ${team.shortName}'s upcoming fixture. No live AI is active yet.`,
      items: facts.map((fact, index) =>
        createBriefingItem(fact, `${game.id}-brief-${index + 1}`),
      ),
      limitations: [
        "This briefing is a deterministic template, not live AI generation.",
        "football-data.org does not provide injury availability in this integration.",
      ],
      generatedAt: fetchedAt.toISOString(),
    });
  }

  return {
    schedule: gameScheduleSchema.parse({
      team,
      games,
      context,
      freshness: { ...freshness, expiresAt: scheduleExpiry.toISOString() },
    }),
    snapshots,
    briefingByGame,
  };
}
