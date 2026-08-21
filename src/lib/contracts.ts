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

/**
 * A final score as the provider reported it. Absent, never zeroed: a game that
 * has not finished carries no `result` at all, which is what keeps a goalless
 * finished draw distinguishable from a game that has not kicked off.
 */
export const gameResultSchema = z.object({
  homeScore: z.number().int().nonnegative(),
  awayScore: z.number().int().nonnegative(),
  // How the game reached its final score, and optional because only
  // football-data reports it today. /rules settles soccer on 90 minutes plus
  // stoppage, so a match marked `extra` or `shootout` carries a score that is
  // NOT the 90-minute result and must not grade a 90-minute market. Absent
  // means the feed did not say — never assume `regulation`.
  completion: z.enum(["regulation", "extra", "shootout"]).optional(),
  source: z.string().min(1),
  observedAt: z.iso.datetime(),
});
export type GameResult = z.infer<typeof gameResultSchema>;

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
  result: gameResultSchema.optional(),
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
  // Machine values keep their canonical provider form; the reader decides how to
  // present them. "datetime" values are ISO strings rendered in the browser
  // timezone rather than shown raw.
  valueType: z.enum(["text", "datetime"]).default("text"),
  sourceId: z.string(),
  observedAt: z.iso.datetime(),
});
export type EvidenceFact = z.infer<typeof evidenceFactSchema>;
export type EvidenceFactInput = z.input<typeof evidenceFactSchema>;

export const briefingItemSchema = z.object({
  id: z.string(),
  category: z.string(),
  text: z.string(),
  // Set when the item ends on a timestamp, so the reader can render it in
  // the browser timezone instead of inlining an ISO string in the prose.
  timestamp: z.iso.datetime().optional(),
  evidenceIds: z.array(z.string()).min(1),
});
export type BriefingItem = z.infer<typeof briefingItemSchema>;

export const briefingSchema = z.object({
  gameId: z.string(),
  // "demo" is seeded fixture prose, "ai" is a validated model generation, and
  // "fallback" is the deterministic evidence briefing served when generation
  // is unavailable or failed validation.
  mode: z.enum(["demo", "ai", "fallback"]),
  summary: z.string(),
  items: z.array(briefingItemSchema).min(1).max(7),
  limitations: z.array(z.string()).min(1),
  generatedAt: z.iso.datetime(),
  generation: z
    .object({
      model: z.string(),
      promptVersion: z.string(),
      schemaVersion: z.string(),
      latencyMs: z.number().int().nonnegative(),
    })
    .optional(),
});
export type Briefing = z.infer<typeof briefingSchema>;

export const briefingResultModeSchema = z.enum(["live", "fallback"]);
export type BriefingResultMode = z.infer<typeof briefingResultModeSchema>;

/** Why a request did not return a live generation. Absent when it did. */
export const briefingReasonSchema = z.enum([
  "ai_unconfigured",
  "validation_failed",
  "provider_unavailable",
  "provider_timeout",
  "provider_rate_limited",
]);
export type BriefingReason = z.infer<typeof briefingReasonSchema>;

export const briefingQuotaSchema = z.object({
  remaining: z.number().int().nonnegative(),
  resetAt: z.iso.datetime(),
});
export type BriefingQuota = z.infer<typeof briefingQuotaSchema>;

export const briefingResultSchema = z.object({
  briefing: briefingSchema,
  mode: briefingResultModeSchema,
  reason: briefingReasonSchema.optional(),
  quota: briefingQuotaSchema.optional(),
});
export type BriefingResult = z.infer<typeof briefingResultSchema>;

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

export const gameSnapshotSchema = z
  .object({
    game: gameSummarySchema,
    context: sportContextSchema,
    sources: z.array(sourceSchema).min(1),
    evidenceFacts: z.array(evidenceFactSchema).min(1),
    freshness: freshnessSchema,
  })
  // A fact carrying the game's own scheduled timestamp is a datetime whatever
  // the stored row says, so snapshots cached before `valueType` existed still
  // render in the browser timezone instead of showing a raw ISO string.
  .transform((snapshot) => ({
    ...snapshot,
    evidenceFacts: snapshot.evidenceFacts.map((fact) =>
      fact.value === snapshot.game.scheduledAt
        ? { ...fact, valueType: "datetime" as const }
        : fact,
    ),
  }));
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

// Mirrors `Grade` in src/lib/markets.ts (contracts.ts cannot import markets.ts
// without a cycle, since markets.ts already imports Sport/GameSummary from
// here). No "push": every published market line ends in .5, so it is
// unreachable — see the markets.ts ponytail note.
export const wagerOutcomeSchema = z.enum(["won", "lost", "void"]);
export type WagerOutcome = z.infer<typeof wagerOutcomeSchema>;

export const creditSummarySchema = z.object({
  balance: z.number().int(),
  lifetimeStaked: z.number().int().nonnegative(),
  lifetimeReturned: z.number().int().nonnegative(),
  net: z.number().int(),
  resetCount: z.number().int().nonnegative(),
  won: z.number().int().nonnegative().default(0),
  lost: z.number().int().nonnegative().default(0),
  voided: z.number().int().nonnegative().default(0),
});
export type CreditSummary = z.infer<typeof creditSummarySchema>;

// Mirrors MIN_STAKE / MAX_STAKE in src/lib/markets.ts — see the comment there
// on why these are literals rather than an import.
export const wagerPlacementSchema = z.object({
  routeId: z.string().min(1).max(200),
  marketId: z.string().min(1).max(100),
  selectionId: z.string().min(1).max(100),
  // Echo only: compared against the server's price, never stored.
  price: z.number().positive(),
  stake: z.number().int().min(1).max(500),
  // Absent = solo wager. Re-checked against real membership server-side,
  // same as price — a client-supplied groupId is never trusted alone.
  groupId: z.uuid().optional(),
});
export type WagerPlacementInput = z.infer<typeof wagerPlacementSchema>;

export const wagerSettlementSchema = z.object({
  outcome: wagerOutcomeSchema,
  returned: z.number().int().nonnegative(),
  settledAt: z.iso.datetime(),
  // The score that decided this wager, read back from the game at display
  // time rather than copied into the wager row. Optional because the game
  // row can be gone by then — history still renders from the stored
  // `matchup`, and the result reads "Not provided" rather than inventing a
  // score. A void carries none: nothing decided it.
  finalScore: z
    .object({
      homeScore: z.number().int().nonnegative(),
      awayScore: z.number().int().nonnegative(),
    })
    .optional(),
});
export type WagerSettlement = z.infer<typeof wagerSettlementSchema>;

export const wagerSchema = z.object({
  id: z.uuid(),
  routeId: z.string().min(1),
  canonicalGameId: z.string().min(1),
  // Absent for a solo wager. Set once at insert time, never updated.
  groupId: z.uuid().optional(),
  sport: sportSchema,
  marketId: z.string().min(1),
  marketLabel: z.string().min(1),
  selectionId: z.string().min(1),
  selectionLabel: z.string().min(1),
  line: z.number().optional(),
  price: z.number().positive(),
  stake: z.number().int().positive(),
  potentialReturn: z.number().int().nonnegative(),
  matchup: z.string().min(1),
  competition: z.string().min(1),
  scheduledAt: z.iso.datetime(),
  placedAt: z.iso.datetime(),
  // Derived from whether a `return` credit_entries row exists for this
  // wager (Session 09) — never a stored column. Kept alongside the richer
  // `settlement` object below so existing callers that only read `settled`
  // do not churn.
  settled: z.boolean(),
  settlement: wagerSettlementSchema.optional(),
});
export type Wager = z.infer<typeof wagerSchema>;

export const wagerPlacementResultSchema = z.object({
  wager: wagerSchema,
  summary: creditSummarySchema,
});
export type WagerPlacementResult = z.infer<typeof wagerPlacementResultSchema>;

export const groupMemberRoleSchema = z.enum(["owner", "member"]);
export type GroupMemberRole = z.infer<typeof groupMemberRoleSchema>;

export const groupSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  slug: z.string().min(1),
  createdByUserId: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type Group = z.infer<typeof groupSchema>;

export const groupMemberSchema = z.object({
  groupId: z.uuid(),
  userId: z.uuid(),
  role: groupMemberRoleSchema,
  name: z.string().nullable(),
  email: z.string().nullable(),
  notifyOnActivity: z.boolean(),
  joinedAt: z.iso.datetime(),
});
export type GroupMember = z.infer<typeof groupMemberSchema>;

export const groupInviteStatusSchema = z.enum([
  "pending",
  "accepted",
  "expired",
]);
export type GroupInviteStatus = z.infer<typeof groupInviteStatusSchema>;

export const groupInviteSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  email: z.email(),
  status: groupInviteStatusSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type GroupInvite = z.infer<typeof groupInviteSchema>;

// Ranked by net return (sum of `return` credit_entries minus stakes) over a
// group's wagers only — a read-time aggregate, never a stored column, same
// as CreditSummary.
export const groupLeaderboardEntrySchema = z.object({
  userId: z.uuid(),
  name: z.string().nullable(),
  netReturn: z.number().int(),
  wagerCount: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
  voided: z.number().int().nonnegative(),
});
export type GroupLeaderboardEntry = z.infer<typeof groupLeaderboardEntrySchema>;

export const groupCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export type GroupCreateInput = z.infer<typeof groupCreateSchema>;

export const groupInviteRequestSchema = z.object({
  email: z.email(),
});
export type GroupInviteRequestInput = z.infer<typeof groupInviteRequestSchema>;

export const groupNotifyRequestSchema = z.object({
  notifyOnActivity: z.boolean(),
});
export type GroupNotifyRequestInput = z.infer<typeof groupNotifyRequestSchema>;
