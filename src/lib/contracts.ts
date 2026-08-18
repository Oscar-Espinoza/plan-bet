import { z } from "zod";

export const sportSchema = z.enum(["soccer", "baseball"]);
export type Sport = z.infer<typeof sportSchema>;

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
});
export type Team = z.infer<typeof teamSchema>;

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
  status: z.literal("scheduled"),
});
export type GameSummary = z.infer<typeof gameSummarySchema>;

const availabilitySchema = z.object({
  name: z.string(),
  status: z.string(),
  note: z.string().optional(),
});

export const soccerContextSchema = z.object({
  kind: z.literal("soccer"),
  tablePosition: z.number().int().positive(),
  points: z.number().int().nonnegative(),
  record: z.string(),
  recentForm: z.array(z.enum(["W", "D", "L"])).length(5),
  availability: z.array(availabilitySchema),
  matchupNotes: z.array(z.string()).min(1),
});
export type SoccerContext = z.infer<typeof soccerContextSchema>;

const pitcherSchema = z.object({
  team: z.string(),
  name: z.string().optional(),
  throws: z.enum(["L", "R"]).optional(),
  era: z.string().optional(),
});

export const baseballContextSchema = z.object({
  kind: z.literal("baseball"),
  divisionRank: z.number().int().positive(),
  record: z.string(),
  lastTen: z.string(),
  recentForm: z.array(z.enum(["W", "L"])).length(5),
  probablePitchers: z.array(pitcherSchema).length(2),
  splits: z.object({
    vsLeft: z.string().optional(),
    vsRight: z.string().optional(),
  }),
  availability: z.array(availabilitySchema),
  matchupNotes: z.array(z.string()).min(1),
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
  observedAt: z.iso.datetime(),
});

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
  mode: z.literal("demo"),
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

export const gameSnapshotSchema = z.object({
  mode: z.literal("demo"),
  generatedAt: z.iso.datetime(),
  game: gameSummarySchema,
  context: sportContextSchema,
  sources: z.array(sourceSchema).min(1),
  evidenceFacts: z.array(evidenceFactSchema).min(1),
  briefing: briefingSchema,
});
export type GameSnapshot = z.infer<typeof gameSnapshotSchema>;
