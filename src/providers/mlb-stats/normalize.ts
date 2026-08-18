import {
  gameScheduleSchema,
  gameSnapshotSchema,
  gameStatusSchema,
  teamSchema,
  type BaseballContext,
  type Freshness,
  type GameStatus,
  type StatcastBatting,
  type TeamSlug,
} from "@/lib/contracts";
import { getTeam } from "@/lib/seed";
import type { ProviderSnapshot } from "@/providers/contracts";
import type {
  MlbPerson,
  MlbScheduleGame,
  MlbStandingsResponse,
  MlbTeam,
  SavantExpectedTeamRow,
} from "@/providers/mlb-stats/schemas";

export const MLB_STATS_PROVIDER = "mlb-stats";
export const MLB_STATS_ATTRIBUTION = {
  name: "MLB Stats",
  url: "https://statsapi.mlb.com/",
} as const;
export const BASEBALL_SAVANT_PROVIDER = "baseball-savant";

export const MLB_PROVIDER_IDS = {
  "new-york-yankees": 147,
  "boston-red-sox": 111,
} as const satisfies Record<"new-york-yankees" | "boston-red-sox", number>;

export const MLB_SAVANT_CODES = {
  "new-york-yankees": "NYY",
  "boston-red-sox": "BOS",
} as const;

type BaseballSlug = keyof typeof MLB_PROVIDER_IDS;

const TRACKED_SLUGS_BY_ID = new Map<number, TeamSlug>(
  Object.entries(MLB_PROVIDER_IDS).map(([slug, id]) => [id, slug as TeamSlug]),
);

export function normalizeMlbStatus(input: {
  abstractGameState: string;
  detailedState: string;
}): GameStatus {
  const value =
    `${input.abstractGameState} ${input.detailedState}`.toLowerCase();
  if (/cancel/.test(value)) return "cancelled";
  if (/postpon|suspend/.test(value)) return "postponed";
  if (/final|game over|completed early/.test(value)) return "finished";
  if (/live|in progress|manager challenge/.test(value)) return "live";
  if (/preview|scheduled|pre-game|warmup/.test(value)) return "scheduled";
  return gameStatusSchema.parse("unknown");
}

function normalizeTeam(slug: BaseballSlug, raw: MlbTeam) {
  const configured = getTeam(slug)!;
  return teamSchema.parse({
    ...configured,
    abbreviation: raw.abbreviation ?? configured.abbreviation,
    providerIds: {
      ...configured.providerIds,
      [MLB_STATS_PROVIDER]: String(raw.id),
      [BASEBALL_SAVANT_PROVIDER]: MLB_SAVANT_CODES[slug],
    },
  });
}

function flattenStandings(standings: MlbStandingsResponse) {
  return standings.records.flatMap((record) => record.teamRecords);
}

function resultFor(game: MlbScheduleGame, teamId: number) {
  const isHome = game.teams.home.team.id === teamId;
  const own = isHome ? game.teams.home : game.teams.away;
  const opponent = isHome ? game.teams.away : game.teams.home;
  if (own.isWinner === true) return "W" as const;
  if (opponent.isWinner === true) return "L" as const;
  if (
    own.score == null ||
    opponent.score == null ||
    own.score === opponent.score
  )
    return undefined;
  return own.score > opponent.score ? ("W" as const) : ("L" as const);
}

function decimal(value: number) {
  return value.toFixed(3).replace(/^0/, "");
}

function toStatcast(row: SavantExpectedTeamRow | undefined) {
  if (!row) return undefined;
  return {
    team: row.team,
    teamCode: row.team_id,
    season: row.year,
    plateAppearances: row.pa,
    ballsInPlay: row.bip,
    battingAverage: row.ba,
    expectedBattingAverage: row.est_ba,
    slugging: row.slg,
    expectedSlugging: row.est_slg,
    woba: row.woba,
    expectedWoba: row.est_woba,
  } satisfies StatcastBatting;
}

export function formatStatcastEvidence(value: StatcastBatting) {
  return `${value.season} · ${value.plateAppearances} PA / ${value.ballsInPlay} BIP · BA ${decimal(value.battingAverage)} / xBA ${decimal(value.expectedBattingAverage)} · SLG ${decimal(value.slugging)} / xSLG ${decimal(value.expectedSlugging)} · wOBA ${decimal(value.woba)} / xwOBA ${decimal(value.expectedWoba)}`;
}

function pitcherFor(
  side: MlbScheduleGame["teams"]["home"],
  people: Map<number, MlbPerson>,
) {
  const probable = side.probablePitcher;
  if (!probable) return undefined;
  const person = people.get(probable.id);
  const era = person?.stats?.flatMap((entry) => entry.splits)[0]?.stat.era;
  return {
    team: side.team.teamName ?? side.team.name,
    name: probable.fullName,
    throws: person?.pitchHand?.code,
    era,
  };
}

function savantCode(team: MlbTeam) {
  return (team.abbreviation ?? team.fileCode)?.toUpperCase();
}

export type NormalizedBaseballTeamData = {
  schedule: ReturnType<typeof gameScheduleSchema.parse>;
  snapshots: ProviderSnapshot[];
};

export function normalizeBaseballTeamData(input: {
  slug: BaseballSlug;
  team: MlbTeam;
  upcoming: MlbScheduleGame[];
  recent: MlbScheduleGame[];
  standings: MlbStandingsResponse;
  pitchers: MlbPerson[];
  statcastRows: SavantExpectedTeamRow[];
  fetchedAt: Date;
}): NormalizedBaseballTeamData {
  const teamId = MLB_PROVIDER_IDS[input.slug];
  const team = normalizeTeam(input.slug, input.team);
  const standing = flattenStandings(input.standings).find(
    (row) => row.team.id === teamId,
  );
  const lastTen = standing?.records?.splitRecords?.find(
    (record) => record.type === "lastTen",
  );
  const completed = [...input.recent]
    .filter((game) => normalizeMlbStatus(game.status) === "finished")
    .sort((a, b) => b.gameDate.localeCompare(a.gameDate))
    .slice(0, 5);
  const recentForm = completed
    .map((game) => resultFor(game, teamId))
    .filter((result): result is "W" | "L" => Boolean(result));
  const people = new Map(input.pitchers.map((person) => [person.id, person]));
  const statcast = new Map(
    input.statcastRows.map((row) => [row.team_id.toUpperCase(), row]),
  );
  const trackedStatcast = toStatcast(
    statcast.get(MLB_SAVANT_CODES[input.slug]),
  );
  const baseContext = {
    kind: "baseball" as const,
    divisionRank: standing?.divisionRank
      ? Number.parseInt(standing.divisionRank, 10) || undefined
      : undefined,
    record:
      standing?.wins != null && standing.losses != null
        ? `${standing.wins}–${standing.losses}`
        : standing?.leagueRecord
          ? `${standing.leagueRecord.wins}–${standing.leagueRecord.losses}`
          : undefined,
    lastTen: lastTen ? `${lastTen.wins}–${lastTen.losses}` : undefined,
    recentForm,
    probablePitchers: [],
    statcast: trackedStatcast ? { trackedTeam: trackedStatcast } : undefined,
    availability: [],
    matchupNotes: [],
  } satisfies BaseballContext;
  const scheduleExpiry = new Date(
    input.fetchedAt.getTime() + 6 * 60 * 60 * 1000,
  );
  const snapshotExpiry = new Date(input.fetchedAt.getTime() + 60 * 60 * 1000);
  const freshness: Freshness = {
    mode: "live",
    provider: MLB_STATS_PROVIDER,
    sourceObservedAt: input.fetchedAt.toISOString(),
    fetchedAt: input.fetchedAt.toISOString(),
    expiresAt: snapshotExpiry.toISOString(),
    attribution: MLB_STATS_ATTRIBUTION,
  };
  const rawGames = [
    ...new Map(input.upcoming.map((game) => [game.gamePk, game])).values(),
  ]
    .filter(
      (game) =>
        game.teams.home.team.id === teamId ||
        game.teams.away.team.id === teamId,
    )
    .filter((game) =>
      ["scheduled", "live", "postponed", "unknown"].includes(
        normalizeMlbStatus(game.status),
      ),
    )
    .sort((a, b) => a.gameDate.localeCompare(b.gameDate))
    .slice(0, 5);
  const snapshots: ProviderSnapshot[] = [];
  const games = rawGames.map((raw) => {
    const routeId = `mlb-${raw.gamePk}-${input.slug}`;
    return {
      id: routeId,
      sport: "baseball" as const,
      teamSlug: input.slug,
      competition: `MLB · ${raw.seriesDescription ?? raw.description ?? "Regular or postseason"}`,
      homeTeam: raw.teams.home.team.name,
      awayTeam: raw.teams.away.team.name,
      homeTeamSlug: TRACKED_SLUGS_BY_ID.get(raw.teams.home.team.id),
      awayTeamSlug: TRACKED_SLUGS_BY_ID.get(raw.teams.away.team.id),
      scheduledAt: raw.gameDate,
      venue: raw.venue?.name,
      status: normalizeMlbStatus(raw.status),
    };
  });

  for (const game of games) {
    const raw = rawGames.find((candidate) =>
      game.id.startsWith(`mlb-${candidate.gamePk}-`),
    )!;
    const trackedIsHome = raw.teams.home.team.id === teamId;
    const opponentSide = trackedIsHome ? raw.teams.away : raw.teams.home;
    const opponentStatcast = toStatcast(
      statcast.get(savantCode(opponentSide.team) ?? ""),
    );
    const probablePitchers = [
      pitcherFor(raw.teams.home, people),
      pitcherFor(raw.teams.away, people),
    ].filter((pitcher): pitcher is NonNullable<typeof pitcher> =>
      Boolean(pitcher),
    );
    const context: BaseballContext = {
      ...baseContext,
      probablePitchers,
      statcast:
        trackedStatcast || opponentStatcast
          ? { trackedTeam: trackedStatcast, opponent: opponentStatcast }
          : undefined,
    };
    const sourceIds = {
      schedule: `${game.id}-source-schedule`,
      venue: `${game.id}-source-venue`,
      standings: `${game.id}-source-standings`,
      form: `${game.id}-source-form`,
      pitchers: `${game.id}-source-pitchers`,
      statcast: `${game.id}-source-statcast`,
    };
    const observedAt = input.fetchedAt.toISOString();
    const standingsObservedAt = standing?.lastUpdated ?? observedAt;
    const sources = [
      {
        id: sourceIds.schedule,
        name: "MLB Stats schedule",
        description: "Official game time, teams, series, and status.",
        provider: MLB_STATS_PROVIDER,
        operation: "upcoming_schedule",
        url: "https://statsapi.mlb.com/api/v1/schedule",
        observedAt,
      },
      {
        id: sourceIds.venue,
        name: "MLB Stats venue",
        description: "Venue attached to the official schedule record.",
        provider: MLB_STATS_PROVIDER,
        operation: "upcoming_schedule",
        url: "https://statsapi.mlb.com/api/v1/schedule",
        observedAt,
      },
      {
        id: sourceIds.standings,
        name: "MLB Stats standings",
        description:
          "Division rank, season record, and last-ten record when supplied.",
        provider: MLB_STATS_PROVIDER,
        operation: "standings",
        url: "https://statsapi.mlb.com/api/v1/standings",
        observedAt: standingsObservedAt,
      },
      {
        id: sourceIds.form,
        name: "MLB Stats completed games",
        description:
          "Up to five completed results from the tracked-team perspective.",
        provider: MLB_STATS_PROVIDER,
        operation: "recent_results",
        url: "https://statsapi.mlb.com/api/v1/schedule",
        observedAt,
      },
      {
        id: sourceIds.pitchers,
        name: "MLB Stats probable pitchers",
        description:
          "Probable names plus handedness and season ERA when supplied.",
        provider: MLB_STATS_PROVIDER,
        operation: "probable_pitchers",
        url: "https://statsapi.mlb.com/api/v1/people",
        observedAt,
      },
      ...(trackedStatcast || opponentStatcast
        ? [
            {
              id: sourceIds.statcast,
              name: "Baseball Savant expected statistics",
              description:
                "Retrospective team batting and expected batting metrics.",
              provider: BASEBALL_SAVANT_PROVIDER,
              operation: "expected_statistics",
              url: "https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter-team",
              observedAt,
            },
          ]
        : []),
    ];
    const factPrefix = `${game.id}-fact`;
    const facts = [
      {
        id: `${factPrefix}-schedule`,
        label: "Scheduled time",
        value: game.scheduledAt,
        sourceId: sourceIds.schedule,
        observedAt,
      },
      {
        id: `${factPrefix}-status`,
        label: "Game status",
        value: game.status,
        sourceId: sourceIds.schedule,
        observedAt,
      },
      {
        id: `${factPrefix}-competition`,
        label: "Series",
        value: game.competition,
        sourceId: sourceIds.schedule,
        observedAt,
      },
      {
        id: `${factPrefix}-venue`,
        label: "Venue",
        value: game.venue ?? "Not provided",
        sourceId: sourceIds.venue,
        observedAt,
      },
      {
        id: `${factPrefix}-standing`,
        label: "Division standing",
        value:
          context.divisionRank && context.record
            ? `#${context.divisionRank} · ${context.record}`
            : "Not provided",
        sourceId: sourceIds.standings,
        observedAt: standingsObservedAt,
      },
      {
        id: `${factPrefix}-form`,
        label: "Recent completed games",
        value: recentForm.length ? recentForm.join(" · ") : "Not provided",
        sourceId: sourceIds.form,
        observedAt,
      },
      {
        id: `${factPrefix}-pitchers`,
        label: "Probable pitchers",
        value: probablePitchers.length
          ? probablePitchers
              .map(
                (pitcher) =>
                  `${pitcher.team}: ${pitcher.name ?? "Not provided"} · ${pitcher.throws ?? "Not provided"} · ERA ${pitcher.era ?? "Not provided"}`,
              )
              .join("; ")
          : "Not provided",
        sourceId: sourceIds.pitchers,
        observedAt,
      },
      ...(trackedStatcast
        ? [
            {
              id: `${factPrefix}-statcast-team`,
              label: `${team.shortName} Statcast batting`,
              value: formatStatcastEvidence(trackedStatcast),
              sourceId: sourceIds.statcast,
              observedAt,
            },
          ]
        : []),
      ...(opponentStatcast
        ? [
            {
              id: `${factPrefix}-statcast-opponent`,
              label: `${opponentSide.team.teamName ?? opponentSide.team.name} Statcast batting`,
              value: formatStatcastEvidence(opponentStatcast),
              sourceId: sourceIds.statcast,
              observedAt,
            },
          ]
        : []),
    ];
    const snapshot = gameSnapshotSchema.parse({
      game,
      context,
      sources,
      evidenceFacts: facts,
      freshness,
    });
    snapshots.push({
      providerGameId: String(raw.gamePk),
      canonicalGameId: `mlb-${raw.gamePk}`,
      route: { id: game.id, teamSlug: input.slug },
      snapshot,
    });
  }

  return {
    schedule: gameScheduleSchema.parse({
      team,
      games,
      context: snapshots[0]?.snapshot.context ?? baseContext,
      freshness: { ...freshness, expiresAt: scheduleExpiry.toISOString() },
    }),
    snapshots,
  };
}
