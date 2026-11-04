import { z } from "zod";

const providerTeamSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  shortName: z.string().min(1).nullable().optional(),
  tla: z.string().nullable().optional(),
  crest: z.url().nullable().optional(),
});

export const footballDataTeamSchema = providerTeamSummarySchema.extend({
  venue: z.string().nullable().optional(),
  lastUpdated: z.iso.datetime().nullable().optional(),
});

export const footballDataMatchSchema = z.object({
  id: z.number().int().positive(),
  utcDate: z.iso.datetime(),
  status: z.string().min(1),
  stage: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
  lastUpdated: z.iso.datetime().nullable().optional(),
  competition: z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    code: z.string().nullable().optional(),
  }),
  homeTeam: providerTeamSummarySchema,
  awayTeam: providerTeamSummarySchema,
  score: z
    .object({
      duration: z.string().nullable().optional(),
      fullTime: z
        .object({
          home: z.number().int().nullable().optional(),
          away: z.number().int().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
});

export const footballDataMatchesSchema = z.object({
  matches: z.array(footballDataMatchSchema),
});

const standingRowSchema = z.object({
  position: z.number().int().positive(),
  team: providerTeamSummarySchema,
  playedGames: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  draw: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
  points: z.number().int().nonnegative(),
});

export const footballDataStandingsSchema = z.object({
  competition: z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    code: z.string().nullable().optional(),
  }),
  standings: z.array(
    z.object({
      type: z.string(),
      table: z.array(standingRowSchema),
    }),
  ),
});

export type FootballDataTeam = z.infer<typeof footballDataTeamSchema>;
export type FootballDataMatch = z.infer<typeof footballDataMatchSchema>;
export type FootballDataStandings = z.infer<typeof footballDataStandingsSchema>;
