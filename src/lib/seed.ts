import {
  briefingSchema,
  gameSnapshotSchema,
  gameSummarySchema,
  teamSchema,
  type BaseballContext,
  type Briefing,
  type GameSnapshot,
  type GameSummary,
  type SoccerContext,
  type Sport,
  type Team,
  type TeamSlug,
} from "@/lib/contracts";

const DAY = 86_400_000;

export function getDemoAnchor(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12),
  );
}

export const demoGeneratedAt = new Date(
  getDemoAnchor().getTime() - 2 * 60 * 60 * 1000,
).toISOString();

const rawTeams: Team[] = [
  {
    slug: "real-madrid",
    sport: "soccer",
    name: "Real Madrid",
    shortName: "Madrid",
    abbreviation: "RMA",
    mark: "RM",
    colors: { primary: "#d8c26e", secondary: "#f7f3dd" },
    providerIds: { demo: "soc-001", "football-data": "86" },
  },
  {
    slug: "barcelona",
    sport: "soccer",
    name: "FC Barcelona",
    shortName: "Barcelona",
    abbreviation: "FCB",
    mark: "FCB",
    colors: { primary: "#a8274c", secondary: "#1e4fa3" },
    providerIds: { demo: "soc-002", "football-data": "81" },
  },
  {
    slug: "new-york-yankees",
    sport: "baseball",
    name: "New York Yankees",
    shortName: "Yankees",
    abbreviation: "NYY",
    mark: "NY",
    colors: { primary: "#a7b4c8", secondary: "#132448" },
    providerIds: { demo: "mlb-001" },
  },
  {
    slug: "boston-red-sox",
    sport: "baseball",
    name: "Boston Red Sox",
    shortName: "Red Sox",
    abbreviation: "BOS",
    mark: "B",
    colors: { primary: "#d24851", secondary: "#17365d" },
    providerIds: { demo: "mlb-002" },
  },
];

export const teams = teamSchema.array().parse(rawTeams);

type GameTemplate = Omit<GameSummary, "scheduledAt" | "status"> & {
  dayOffset: number;
  hourUtc: number;
};

const gameTemplates: Record<TeamSlug, GameTemplate[]> = {
  "real-madrid": [
    {
      id: "soc-rma-01",
      sport: "soccer",
      teamSlug: "real-madrid",
      competition: "LaLiga",
      homeTeam: "Real Madrid",
      awayTeam: "Villarreal",
      homeTeamSlug: "real-madrid",
      venue: "Santiago Bernabéu",
      dayOffset: 2,
      hourUtc: 19,
    },
    {
      id: "soc-rma-02",
      sport: "soccer",
      teamSlug: "real-madrid",
      competition: "UEFA Champions League",
      homeTeam: "Inter",
      awayTeam: "Real Madrid",
      awayTeamSlug: "real-madrid",
      venue: "San Siro",
      dayOffset: 6,
      hourUtc: 20,
    },
    {
      id: "soc-rma-03",
      sport: "soccer",
      teamSlug: "real-madrid",
      competition: "LaLiga",
      homeTeam: "Real Sociedad",
      awayTeam: "Real Madrid",
      awayTeamSlug: "real-madrid",
      venue: "Reale Arena",
      dayOffset: 10,
      hourUtc: 17,
    },
    {
      id: "soc-rma-04",
      sport: "soccer",
      teamSlug: "real-madrid",
      competition: "LaLiga",
      homeTeam: "Real Madrid",
      awayTeam: "Sevilla",
      homeTeamSlug: "real-madrid",
      venue: "Santiago Bernabéu",
      dayOffset: 15,
      hourUtc: 20,
    },
    {
      id: "soc-rma-05",
      sport: "soccer",
      teamSlug: "real-madrid",
      competition: "Copa del Rey",
      homeTeam: "Athletic Club",
      awayTeam: "Real Madrid",
      awayTeamSlug: "real-madrid",
      venue: "San Mamés",
      dayOffset: 20,
      hourUtc: 18,
    },
  ],
  barcelona: [
    {
      id: "soc-fcb-01",
      sport: "soccer",
      teamSlug: "barcelona",
      competition: "LaLiga",
      homeTeam: "FC Barcelona",
      awayTeam: "Real Betis",
      homeTeamSlug: "barcelona",
      venue: "Estadi Olímpic",
      dayOffset: 3,
      hourUtc: 20,
    },
    {
      id: "soc-fcb-02",
      sport: "soccer",
      teamSlug: "barcelona",
      competition: "UEFA Champions League",
      homeTeam: "Arsenal",
      awayTeam: "FC Barcelona",
      awayTeamSlug: "barcelona",
      venue: "Emirates Stadium",
      dayOffset: 7,
      hourUtc: 20,
    },
    {
      id: "soc-fcb-03",
      sport: "soccer",
      teamSlug: "barcelona",
      competition: "LaLiga",
      homeTeam: "Valencia",
      awayTeam: "FC Barcelona",
      awayTeamSlug: "barcelona",
      venue: "Mestalla",
      dayOffset: 11,
      hourUtc: 18,
    },
    {
      id: "soc-fcb-04",
      sport: "soccer",
      teamSlug: "barcelona",
      competition: "LaLiga",
      homeTeam: "FC Barcelona",
      awayTeam: "Girona",
      homeTeamSlug: "barcelona",
      venue: "Estadi Olímpic",
      dayOffset: 16,
      hourUtc: 19,
    },
    {
      id: "soc-fcb-05",
      sport: "soccer",
      teamSlug: "barcelona",
      competition: "Copa del Rey",
      homeTeam: "Atlético Madrid",
      awayTeam: "FC Barcelona",
      awayTeamSlug: "barcelona",
      venue: "Metropolitano",
      dayOffset: 21,
      hourUtc: 20,
    },
  ],
  "new-york-yankees": [
    {
      id: "mlb-nyy-01",
      sport: "baseball",
      teamSlug: "new-york-yankees",
      competition: "MLB · American League",
      homeTeam: "New York Yankees",
      awayTeam: "Toronto Blue Jays",
      homeTeamSlug: "new-york-yankees",
      venue: "Yankee Stadium",
      dayOffset: 1,
      hourUtc: 23,
    },
    {
      id: "mlb-nyy-02",
      sport: "baseball",
      teamSlug: "new-york-yankees",
      competition: "MLB · American League",
      homeTeam: "New York Yankees",
      awayTeam: "Toronto Blue Jays",
      homeTeamSlug: "new-york-yankees",
      venue: "Yankee Stadium",
      dayOffset: 2,
      hourUtc: 18,
    },
    {
      id: "mlb-nyy-03",
      sport: "baseball",
      teamSlug: "new-york-yankees",
      competition: "MLB · American League",
      homeTeam: "Baltimore Orioles",
      awayTeam: "New York Yankees",
      awayTeamSlug: "new-york-yankees",
      venue: "Camden Yards",
      dayOffset: 4,
      hourUtc: 23,
    },
    {
      id: "mlb-nyy-04",
      sport: "baseball",
      teamSlug: "new-york-yankees",
      competition: "MLB · American League",
      homeTeam: "Baltimore Orioles",
      awayTeam: "New York Yankees",
      awayTeamSlug: "new-york-yankees",
      venue: "Camden Yards",
      dayOffset: 5,
      hourUtc: 17,
    },
    {
      id: "mlb-nyy-05",
      sport: "baseball",
      teamSlug: "new-york-yankees",
      competition: "MLB · Interleague",
      homeTeam: "New York Yankees",
      awayTeam: "New York Mets",
      homeTeamSlug: "new-york-yankees",
      venue: "Yankee Stadium",
      dayOffset: 8,
      hourUtc: 23,
    },
  ],
  "boston-red-sox": [
    {
      id: "mlb-bos-01",
      sport: "baseball",
      teamSlug: "boston-red-sox",
      competition: "MLB · American League",
      homeTeam: "Boston Red Sox",
      awayTeam: "Tampa Bay Rays",
      homeTeamSlug: "boston-red-sox",
      venue: "Fenway Park",
      dayOffset: 1,
      hourUtc: 23,
    },
    {
      id: "mlb-bos-02",
      sport: "baseball",
      teamSlug: "boston-red-sox",
      competition: "MLB · American League",
      homeTeam: "Boston Red Sox",
      awayTeam: "Tampa Bay Rays",
      homeTeamSlug: "boston-red-sox",
      venue: "Fenway Park",
      dayOffset: 3,
      hourUtc: 17,
    },
    {
      id: "mlb-bos-03",
      sport: "baseball",
      teamSlug: "boston-red-sox",
      competition: "MLB · American League",
      homeTeam: "Detroit Tigers",
      awayTeam: "Boston Red Sox",
      awayTeamSlug: "boston-red-sox",
      venue: "Comerica Park",
      dayOffset: 5,
      hourUtc: 23,
    },
    {
      id: "mlb-bos-04",
      sport: "baseball",
      teamSlug: "boston-red-sox",
      competition: "MLB · American League",
      homeTeam: "Detroit Tigers",
      awayTeam: "Boston Red Sox",
      awayTeamSlug: "boston-red-sox",
      venue: "Comerica Park",
      dayOffset: 6,
      hourUtc: 18,
    },
    {
      id: "mlb-bos-05",
      sport: "baseball",
      teamSlug: "boston-red-sox",
      competition: "MLB · American League",
      homeTeam: "Boston Red Sox",
      awayTeam: "Houston Astros",
      homeTeamSlug: "boston-red-sox",
      venue: "Fenway Park",
      dayOffset: 9,
      hourUtc: 23,
    },
  ],
};

export function generateGames(
  teamSlug: TeamSlug,
  now = new Date(),
): GameSummary[] {
  const anchor = getDemoAnchor(now);
  return gameTemplates[teamSlug].map(({ dayOffset, hourUtc, ...game }) => {
    const date = new Date(anchor.getTime() + dayOffset * DAY);
    date.setUTCHours(hourUtc, 0, 0, 0);
    return gameSummarySchema.parse({
      ...game,
      scheduledAt: date.toISOString(),
      status: "scheduled",
    });
  });
}

export const gamesByTeam = Object.fromEntries(
  teams.map((team) => [team.slug, generateGames(team.slug)]),
) as Record<TeamSlug, GameSummary[]>;

export const allGames = Object.values(gamesByTeam).flat();

const soccerContexts: Record<"real-madrid" | "barcelona", SoccerContext> = {
  "real-madrid": {
    kind: "soccer",
    tablePosition: 2,
    points: 61,
    record: "18W · 7D · 3L",
    recentForm: ["W", "W", "D", "W", "L"],
    availability: [
      {
        name: "D. Carvajal",
        status: "Monitoring",
        note: "Late fitness check in this demo scenario",
      },
      { name: "E. Militão", status: "Available" },
    ],
    matchupNotes: [
      "Four of the last five demo fixtures were decided by one goal.",
      "Madrid carry the stronger home defensive record in this snapshot.",
    ],
  },
  barcelona: {
    kind: "soccer",
    tablePosition: 1,
    points: 64,
    record: "20W · 4D · 4L",
    recentForm: ["W", "D", "W", "W", "W"],
    availability: [
      { name: "Pedri", status: "Available" },
      {
        name: "A. Christensen",
        status: "Monitoring",
        note: "Workload managed in this demo scenario",
      },
    ],
    matchupNotes: [
      "Barcelona have led at halftime in three of their five demo form matches.",
      "The opponent allows more chances from wide areas in this snapshot.",
    ],
  },
};

const baseballContexts: Record<
  "new-york-yankees" | "boston-red-sox",
  BaseballContext
> = {
  "new-york-yankees": {
    kind: "baseball",
    divisionRank: 1,
    record: "71–49",
    lastTen: "7–3",
    recentForm: ["W", "W", "L", "W", "W"],
    probablePitchers: [
      { team: "Yankees", name: "Marcus Cole", throws: "R", era: "3.24" },
      { team: "Opponent", name: "Eli Navarro", throws: "L", era: "3.88" },
    ],
    splits: { vsLeft: ".267 AVG / .794 OPS", vsRight: ".251 AVG / .751 OPS" },
    availability: [
      {
        name: "J. Torres",
        status: "Day-to-day",
        note: "Demo lower-body soreness",
      },
    ],
    matchupNotes: [
      "The demo lineup has produced its strongest slugging marks against left-handed starters.",
      "The bullpen worked seven innings across the prior two demo games.",
    ],
  },
  "boston-red-sox": {
    kind: "baseball",
    divisionRank: 3,
    record: "65–55",
    lastTen: "6–4",
    recentForm: ["L", "W", "W", "L", "W"],
    probablePitchers: [
      { team: "Red Sox", name: "Noah Bennett", throws: "L", era: "3.71" },
      { team: "Opponent", name: undefined, throws: undefined, era: undefined },
    ],
    splits: { vsLeft: ".243 AVG / .721 OPS", vsRight: ".264 AVG / .778 OPS" },
    availability: [
      {
        name: "M. Santos",
        status: "Monitoring",
        note: "Demo wrist management",
      },
    ],
    matchupNotes: [
      "Boston's demo offense has scored first in six of ten games.",
      "The opposing starter is not provided in this snapshot.",
    ],
  },
};

const contextFor = (slug: TeamSlug) =>
  slug === "real-madrid" || slug === "barcelona"
    ? soccerContexts[slug]
    : baseballContexts[slug];

function makeSnapshot(game: GameSummary): GameSnapshot {
  const team = getTeam(game.teamSlug)!;
  const context = contextFor(game.teamSlug);
  const sourcePrefix = game.id;
  const sources = [
    {
      id: `${sourcePrefix}-schedule`,
      name: "Demo schedule feed",
      description:
        "Date-relative fixture, venue, and competition data for the portfolio preview.",
      provider: "demo",
      operation: "schedule",
      observedAt: demoGeneratedAt,
    },
    {
      id: `${sourcePrefix}-context`,
      name: "Demo analyst notebook",
      description:
        "Plausible, non-live form and matchup context created for Session 01.",
      provider: "demo",
      operation: "context",
      observedAt: demoGeneratedAt,
    },
  ];
  const formValue = context.recentForm.join(" · ");
  const standingValue =
    context.kind === "soccer"
      ? `#${context.tablePosition} · ${context.points} pts`
      : `#${context.divisionRank} division · ${context.record}`;
  const evidenceFacts = [
    {
      id: `${sourcePrefix}-fact-form`,
      label: context.kind === "soccer" ? "Last five" : "Recent form",
      value: formValue,
      sourceId: `${sourcePrefix}-context`,
      observedAt: demoGeneratedAt,
    },
    {
      id: `${sourcePrefix}-fact-standing`,
      label: context.kind === "soccer" ? "Table position" : "Division standing",
      value: standingValue,
      sourceId: `${sourcePrefix}-context`,
      observedAt: demoGeneratedAt,
    },
    {
      id: `${sourcePrefix}-fact-venue`,
      label: "Venue",
      value: game.venue ?? "Not provided",
      sourceId: `${sourcePrefix}-schedule`,
      observedAt: demoGeneratedAt,
    },
    {
      id: `${sourcePrefix}-fact-availability`,
      label: "Availability",
      value:
        context.availability
          .map((entry) => `${entry.name}: ${entry.status}`)
          .join("; ") || "Not provided",
      sourceId: `${sourcePrefix}-context`,
      observedAt: demoGeneratedAt,
    },
    {
      id: `${sourcePrefix}-fact-matchup`,
      label: "Matchup note",
      value: context.matchupNotes[0],
      sourceId: `${sourcePrefix}-context`,
      observedAt: demoGeneratedAt,
    },
  ];
  const briefing: Briefing = {
    gameId: game.id,
    mode: "demo",
    summary: `${team.shortName} enter this scheduled matchup with a clear set of form, availability, and venue cues to review.`,
    items: [
      {
        id: `${sourcePrefix}-brief-1`,
        category: "Form",
        text: `${team.shortName}'s recent sequence is ${formValue}.`,
        evidenceIds: [`${sourcePrefix}-fact-form`],
      },
      {
        id: `${sourcePrefix}-brief-2`,
        category: "Standing",
        text: `The current demo standing is ${standingValue}.`,
        evidenceIds: [`${sourcePrefix}-fact-standing`],
      },
      {
        id: `${sourcePrefix}-brief-3`,
        category: "Setting",
        text: `The matchup is scheduled at ${game.venue ?? "a venue not provided"}.`,
        evidenceIds: [`${sourcePrefix}-fact-venue`],
      },
      {
        id: `${sourcePrefix}-brief-4`,
        category: "Availability",
        text: evidenceFacts[3].value,
        evidenceIds: [`${sourcePrefix}-fact-availability`],
      },
      {
        id: `${sourcePrefix}-brief-5`,
        category: "Matchup",
        text: context.matchupNotes[0],
        evidenceIds: [`${sourcePrefix}-fact-matchup`],
      },
    ],
    limitations: [
      "This is a designed example, not a live report.",
      "Confirm lineups, injuries, and probable starters with official sources before the event.",
    ],
    generatedAt: demoGeneratedAt,
  };
  briefingSchema.parse(briefing);
  return gameSnapshotSchema.parse({
    game,
    context,
    sources,
    evidenceFacts,
    freshness: {
      mode: "demo",
      provider: "demo",
      sourceObservedAt: demoGeneratedAt,
      fetchedAt: demoGeneratedAt,
      attribution: {
        name: "Matchday Plan demo data",
        url: "https://plan-bet.vercel.app",
      },
    },
  });
}

export function getDemoBriefing(id: string, now = new Date()) {
  const game = getGame(id, now);
  if (!game) return undefined;
  const snapshot = makeSnapshot(game);
  const team = getTeam(game.teamSlug)!;
  const context = snapshot.context;
  const formValue = context.recentForm.join(" · ");
  const standingValue =
    context.kind === "soccer"
      ? `#${context.tablePosition ?? "Not provided"} · ${context.points ?? "Not provided"} pts`
      : `#${context.divisionRank} division · ${context.record}`;
  return briefingSchema.parse({
    gameId: game.id,
    mode: "demo",
    summary: `${team.shortName} enter this scheduled matchup with a clear set of form, availability, and venue cues to review.`,
    items: [
      {
        id: `${game.id}-brief-1`,
        category: "Form",
        text: `${team.shortName}'s recent sequence is ${formValue}.`,
        evidenceIds: [`${game.id}-fact-form`],
      },
      {
        id: `${game.id}-brief-2`,
        category: "Standing",
        text: `The current demo standing is ${standingValue}.`,
        evidenceIds: [`${game.id}-fact-standing`],
      },
      {
        id: `${game.id}-brief-3`,
        category: "Setting",
        text: `The matchup is scheduled at ${game.venue ?? "a venue not provided"}.`,
        evidenceIds: [`${game.id}-fact-venue`],
      },
      {
        id: `${game.id}-brief-4`,
        category: "Availability",
        text:
          snapshot.evidenceFacts.find((fact) =>
            fact.id.endsWith("-fact-availability"),
          )?.value ?? "Not provided",
        evidenceIds: [`${game.id}-fact-availability`],
      },
      {
        id: `${game.id}-brief-5`,
        category: "Matchup",
        text:
          snapshot.evidenceFacts.find((fact) =>
            fact.id.endsWith("-fact-matchup"),
          )?.value ?? "Not provided",
        evidenceIds: [`${game.id}-fact-matchup`],
      },
    ],
    limitations: [
      "This is a designed example, not a live report.",
      "Confirm lineups, injuries, and probable starters with official sources before the event.",
    ],
    generatedAt: demoGeneratedAt,
  });
}

export function getTeam(slug: TeamSlug | string) {
  return teams.find((team) => team.slug === slug);
}

export function getTeamsBySport(sport: Sport) {
  return teams.filter((team) => team.sport === sport);
}

export function getGame(id: string, now = new Date()) {
  for (const team of teams) {
    const game = generateGames(team.slug, now).find(
      (candidate) => candidate.id === id,
    );
    if (game) return game;
  }
}

export function getSnapshot(id: string, now = new Date()) {
  const game = getGame(id, now);
  return game ? makeSnapshot(game) : undefined;
}

export function validateSeedData() {
  const currentSnapshots = allGames.map((game) => makeSnapshot(game));
  const currentBriefings = allGames.map((game) => getDemoBriefing(game.id)!);
  const parsedTeams = teamSchema.array().parse(teams);
  const parsedGames = gameSummarySchema.array().parse(allGames);
  const parsedSnapshots = gameSnapshotSchema.array().parse(currentSnapshots);
  for (const snapshot of parsedSnapshots) {
    const evidenceIds = new Set(snapshot.evidenceFacts.map((fact) => fact.id));
    const briefing = currentBriefings.find(
      (candidate) => candidate.gameId === snapshot.game.id,
    )!;
    for (const item of briefing.items) {
      if (!item.evidenceIds.every((id) => evidenceIds.has(id))) {
        throw new Error(`Briefing ${item.id} references missing evidence`);
      }
    }
  }
  return { teams: parsedTeams, games: parsedGames, snapshots: parsedSnapshots };
}
