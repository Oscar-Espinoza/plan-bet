import { gameSnapshotSchema, type GameSnapshot } from "@/lib/contracts";

const OBSERVED = "2026-08-19T10:00:00.000Z";

const SCHEDULED = "2026-08-22T19:00:00.000Z";

function fact(id: string, label: string, value: string) {
  return { id, label, value, sourceId: "src-1", observedAt: OBSERVED };
}

/** Every real adapter emits one; the evaluation snapshots must too. */
function scheduleFact(id: string) {
  return {
    id: `${id}-fact-schedule`,
    label: "Scheduled time",
    value: SCHEDULED,
    valueType: "datetime" as const,
    sourceId: "src-1",
    observedAt: OBSERVED,
  };
}

function base(
  id: string,
  sport: "soccer" | "baseball",
  teamSlug: GameSnapshot["game"]["teamSlug"],
  overrides: {
    competition: string;
    homeTeam: string;
    awayTeam: string;
    context: Record<string, unknown>;
    facts: ReturnType<typeof fact>[];
  },
): GameSnapshot {
  return gameSnapshotSchema.parse({
    game: {
      id,
      sport,
      teamSlug,
      competition: overrides.competition,
      homeTeam: overrides.homeTeam,
      awayTeam: overrides.awayTeam,
      homeTeamSlug: teamSlug,
      scheduledAt: SCHEDULED,
      venue: "Evaluation Stadium",
      status: "scheduled",
    },
    context: overrides.context,
    sources: [
      {
        id: "src-1",
        name: "Evaluation source",
        description: "Fixed evaluation snapshot",
        provider: "evaluation",
        operation: "fixture",
        observedAt: OBSERVED,
      },
    ],
    evidenceFacts: [scheduleFact(id), ...overrides.facts],
    freshness: {
      mode: "live",
      provider: "evaluation",
      sourceObservedAt: OBSERVED,
      fetchedAt: OBSERVED,
      expiresAt: "2036-08-19T10:00:00.000Z",
      attribution: { name: "Evaluation", url: "https://example.com" },
    },
  });
}

const soccerContext = {
  kind: "soccer",
  tablePosition: 2,
  points: 61,
  record: "19W-4D-5L",
  recentForm: ["W", "W", "D", "L", "W"],
  availability: [{ name: "Squad", status: "Available" }],
  matchupNotes: ["Third meeting of the season."],
};

const baseballContext = {
  kind: "baseball",
  divisionRank: 1,
  record: "72-49",
  lastTen: "7-3",
  recentForm: ["W", "L", "W", "W", "L"],
  probablePitchers: [
    { team: "NYY", name: "A. Pitcher", throws: "R", era: "3.10" },
  ],
  availability: [],
  matchupNotes: [],
};

export const soccerSnapshots: GameSnapshot[] = [
  base("eval-soc-1", "soccer", "real-madrid", {
    competition: "La Liga",
    homeTeam: "Real Madrid",
    awayTeam: "Sevilla",
    context: soccerContext,
    facts: [
      fact("eval-soc-1-fact-form", "Recent form", "W W D L W"),
      fact("eval-soc-1-fact-standing", "Table position", "2nd on 61 points"),
      fact("eval-soc-1-fact-venue", "Venue", "Evaluation Stadium"),
      fact(
        "eval-soc-1-fact-availability",
        "Availability",
        "Full squad available",
      ),
      fact(
        "eval-soc-1-fact-matchup",
        "Matchup note",
        "Third meeting of the season",
      ),
      fact("eval-soc-1-fact-competition", "Competition", "La Liga"),
    ],
  }),
  base("eval-soc-2", "soccer", "barcelona", {
    competition: "Copa del Rey",
    homeTeam: "Getafe",
    awayTeam: "FC Barcelona",
    context: {
      ...soccerContext,
      tablePosition: 1,
      recentForm: ["W", "W", "W"],
    },
    facts: [
      fact("eval-soc-2-fact-form", "Recent form", "W W W"),
      fact("eval-soc-2-fact-standing", "Table position", "1st on 68 points"),
      fact("eval-soc-2-fact-venue", "Venue", "Evaluation Stadium"),
      fact("eval-soc-2-fact-availability", "Availability", "Not provided"),
      fact("eval-soc-2-fact-matchup", "Matchup note", "Away leg of the tie"),
    ],
  }),
  base("eval-soc-3", "soccer", "real-madrid", {
    competition: "UEFA Champions League",
    homeTeam: "Real Madrid",
    awayTeam: "Bayern",
    context: { ...soccerContext, points: undefined, recentForm: [] },
    facts: [
      fact("eval-soc-3-fact-form", "Recent form", "Not provided"),
      fact("eval-soc-3-fact-standing", "Group standing", "Second in the group"),
      fact("eval-soc-3-fact-venue", "Venue", "Evaluation Stadium"),
      fact(
        "eval-soc-3-fact-availability",
        "Availability",
        "Two players doubtful",
      ),
      fact("eval-soc-3-fact-matchup", "Matchup note", "First knockout leg"),
    ],
  }),
];

export const baseballSnapshots: GameSnapshot[] = [
  base("eval-mlb-1", "baseball", "new-york-yankees", {
    competition: "MLB Regular Season",
    homeTeam: "New York Yankees",
    awayTeam: "Boston Red Sox",
    context: baseballContext,
    facts: [
      fact("eval-mlb-1-fact-form", "Recent form", "W L W W L"),
      fact("eval-mlb-1-fact-standing", "Division rank", "1st at 72-49"),
      fact("eval-mlb-1-fact-venue", "Venue", "Evaluation Stadium"),
      fact(
        "eval-mlb-1-fact-pitcher",
        "Probable pitcher",
        "A. Pitcher (R), 3.10 ERA",
      ),
      fact(
        "eval-mlb-1-fact-statcast",
        "Statcast batting",
        "BA .268 / xBA .259",
      ),
      fact("eval-mlb-1-fact-lastten", "Last ten", "7-3"),
    ],
  }),
  base("eval-mlb-2", "baseball", "boston-red-sox", {
    competition: "MLB Regular Season",
    homeTeam: "Boston Red Sox",
    awayTeam: "Tampa Bay Rays",
    context: { ...baseballContext, probablePitchers: [] },
    facts: [
      fact("eval-mlb-2-fact-form", "Recent form", "L L W L W"),
      fact("eval-mlb-2-fact-standing", "Division rank", "3rd at 64-57"),
      fact("eval-mlb-2-fact-venue", "Venue", "Evaluation Stadium"),
      fact("eval-mlb-2-fact-pitcher", "Probable pitcher", "Not provided"),
      fact(
        "eval-mlb-2-fact-statcast",
        "Statcast batting",
        "SLG .421 / xSLG .430",
      ),
    ],
  }),
  base("eval-mlb-3", "baseball", "new-york-yankees", {
    competition: "MLB Postseason",
    homeTeam: "Cleveland Guardians",
    awayTeam: "New York Yankees",
    context: { ...baseballContext, lastTen: undefined, recentForm: [] },
    facts: [
      fact("eval-mlb-3-fact-form", "Recent form", "Not provided"),
      fact("eval-mlb-3-fact-standing", "Series", "Game 3 of the series"),
      fact("eval-mlb-3-fact-venue", "Venue", "Evaluation Stadium"),
      fact(
        "eval-mlb-3-fact-pitcher",
        "Probable pitcher",
        "B. Starter (L), 2.88 ERA",
      ),
      fact(
        "eval-mlb-3-fact-statcast",
        "Statcast batting",
        "wOBA .331 / xwOBA .318",
      ),
    ],
  }),
];

export const evaluationSnapshots = [...soccerSnapshots, ...baseballSnapshots];
