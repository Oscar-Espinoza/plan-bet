import { z } from "zod";

export const sportSchema = z.enum(["soccer", "baseball"]);
export type Sport = z.infer<typeof sportSchema>;

export const dataModeSchema = z.enum(["live", "stale", "demo"]);
export type DataMode = z.infer<typeof dataModeSchema>;

export const teamSlugSchema = z.enum([
  "real-madrid",
  "barcelona",
  "new-york-yankees",
  "boston-red-sox",
]);
export type TeamSlug = z.infer<typeof teamSlugSchema>;

export const teamSchema = z.object({
  slug: teamSlugSchema,
  sport: sportSchema,
  name: z.string().min(1),
  shortName: z.string().min(1),
  abbreviation: z.string().min(2).max(4),
  mark: z.string().min(1).max(3),
  colors: z.object({ primary: z.string(), secondary: z.string() }),
  providerIds: z.record(z.string(), z.string()),
  crestUrl: z.url().optional(),
});
export type Team = z.infer<typeof teamSchema>;

export const gameStatusSchema = z.enum([
  "scheduled",
  "live",
  "finished",
  "postponed",
  "cancelled",
  "unknown",
]);
export type GameStatus = z.infer<typeof gameStatusSchema>;

export const gameSummarySchema = z.object({
  id: z.string().min(1),
  sport: sportSchema,
  teamSlug: teamSlugSchema,
  competition: z.string().min(1),
  homeTeam: z.string().min(1),
  awayTeam: z.string().min(1),
  homeTeamSlug: teamSlugSchema.optional(),
  awayTeamSlug: teamSlugSchema.optional(),
  scheduledAt: z.iso.datetime(),
  venue: z.string().optional(),
  status: gameStatusSchema,
});
export type GameSummary = z.infer<typeof gameSummarySchema>;

const availabilitySchema = z.object({
  name: z.string(),
  status: z.string(),
  note: z.string().optional(),
});

export const soccerContextSchema = z.object({
  kind: z.literal("soccer"),
  tablePosition: z.number().int().positive().optional(),
  points: z.number().int().nonnegative().optional(),
  record: z.string().optional(),
  recentForm: z.array(z.enum(["W", "D", "L"])).max(5),
  availability: z.array(availabilitySchema),
  matchupNotes: z.array(z.string()),
});
export type SoccerContext = z.infer<typeof soccerContextSchema>;

const pitcherSchema = z.object({
  team: z.string(),
  name: z.string().optional(),
  throws: z.enum(["L", "R"]).optional(),
  era: z.string().optional(),
});

export const statcastBattingSchema = z.object({
  team: z.string().min(1),
  teamCode: z.string().min(2).max(4),
  season: z.number().int().positive(),
  plateAppearances: z.number().int().nonnegative(),
  ballsInPlay: z.number().int().nonnegative(),
  battingAverage: z.number().nonnegative(),
  expectedBattingAverage: z.number().nonnegative(),
  slugging: z.number().nonnegative(),
  expectedSlugging: z.number().nonnegative(),
  woba: z.number().nonnegative(),
  expectedWoba: z.number().nonnegative(),
});
export type StatcastBatting = z.infer<typeof statcastBattingSchema>;

export const baseballContextSchema = z.object({
  kind: z.literal("baseball"),
  divisionRank: z.number().int().positive().optional(),
  record: z.string().optional(),
  lastTen: z.string().optional(),
  recentForm: z.array(z.enum(["W", "L"])).max(5),
  probablePitchers: z.array(pitcherSchema).max(2),
  splits: z
    .object({
      vsLeft: z.string().optional(),
      vsRight: z.string().optional(),
    })
    .optional(),
  statcast: z
    .object({
      trackedTeam: statcastBattingSchema.optional(),
      opponent: statcastBattingSchema.optional(),
    })
    .optional(),
  availability: z.array(availabilitySchema),
  matchupNotes: z.array(z.string()).optional(),
});
export type BaseballContext = z.infer<typeof baseballContextSchema>;

export const sportContextSchema = z.discriminatedUnion("kind", [
  soccerContextSchema,
  baseballContextSchema,
]);

export const sourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: z.string(),
  operation: z.string(),
  url: z.url().optional(),
  observedAt: z.iso.datetime(),
});
export type SourceReference = z.infer<typeof sourceSchema>;

export const evidenceFactSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  sourceId: z.string(),
  observedAt: z.iso.datetime(),
});
export type EvidenceFact = z.infer<typeof evidenceFactSchema>;

export const briefingSchema = z.object({
  gameId: z.string(),
  mode: z.enum(["demo", "ai"]),
  summary: z.string(),
  items: z
    .array(
      z.object({
        id: z.string(),
        category: z.string(),
        text: z.string(),
        evidenceIds: z.array(z.string()).min(1),
      }),
    )
    .min(5)
    .max(7),
  limitations: z.array(z.string()).min(1),
  generatedAt: z.iso.datetime(),
});
export type Briefing = z.infer<typeof briefingSchema>;

export const attributionSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
});

export const freshnessSchema = z.object({
  mode: dataModeSchema,
  provider: z.string().min(1),
  sourceObservedAt: z.iso.datetime(),
  fetchedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().optional(),
  attribution: attributionSchema,
});
export type Freshness = z.infer<typeof freshnessSchema>;

export const gameSnapshotSchema = z.object({
  game: gameSummarySchema,
  context: sportContextSchema,
  sources: z.array(sourceSchema).min(1),
  evidenceFacts: z.array(evidenceFactSchema).min(1),
  freshness: freshnessSchema,
});
export type GameSnapshot = z.infer<typeof gameSnapshotSchema>;

export const gameScheduleSchema = z.object({
  team: teamSchema,
  games: z.array(gameSummarySchema),
  context: sportContextSchema,
  freshness: freshnessSchema,
});
export type GameSchedule = z.infer<typeof gameScheduleSchema>;

export type GameDetailData = {
  snapshot: GameSnapshot;
  briefing: Briefing;
};

export type ApiSuccess<T> = { data: T };
export type ApiFailure = {
  error: { code: string; message: string; requestId: string };
};
