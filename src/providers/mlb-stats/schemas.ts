import { z } from "zod";

export const mlbTeamSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  teamName: z.string().min(1).optional(),
  shortName: z.string().min(1).optional(),
  abbreviation: z.string().min(2).max(4).optional(),
  fileCode: z.string().min(2).max(4).optional(),
  venue: z
    .object({ id: z.number().int().positive(), name: z.string() })
    .optional(),
  league: z
    .object({ id: z.number().int().positive(), name: z.string() })
    .optional(),
  division: z
    .object({ id: z.number().int().positive(), name: z.string() })
    .optional(),
});

export const mlbTeamsResponseSchema = z.object({
  teams: z.array(mlbTeamSchema),
});

const mlbScheduleSideSchema = z.object({
  team: mlbTeamSchema,
  leagueRecord: z
    .object({
      wins: z.number().int().nonnegative(),
      losses: z.number().int().nonnegative(),
    })
    .optional(),
  probablePitcher: z
    .object({ id: z.number().int().positive(), fullName: z.string().min(1) })
    .optional(),
  score: z.number().int().nonnegative().optional(),
  isWinner: z.boolean().optional(),
});

export const mlbScheduleGameSchema = z.object({
  gamePk: z.number().int().positive(),
  gameType: z.string().min(1),
  season: z.string().regex(/^\d{4}$/),
  gameDate: z.iso.datetime(),
  officialDate: z.string().optional(),
  status: z.object({
    abstractGameState: z.string().min(1),
    detailedState: z.string().min(1),
    codedGameState: z.string().optional(),
    statusCode: z.string().optional(),
  }),
  teams: z.object({
    away: mlbScheduleSideSchema,
    home: mlbScheduleSideSchema,
  }),
  venue: z
    .object({ id: z.number().int().positive(), name: z.string().min(1) })
    .optional(),
  seriesDescription: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

export const mlbScheduleResponseSchema = z.object({
  totalGames: z.number().int().nonnegative().optional(),
  dates: z.array(
    z.object({
      date: z.string(),
      games: z.array(mlbScheduleGameSchema),
    }),
  ),
});

const splitRecordSchema = z.object({
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  type: z.string().min(1),
});

export const mlbStandingsResponseSchema = z.object({
  records: z.array(
    z.object({
      teamRecords: z.array(
        z.object({
          team: mlbTeamSchema,
          divisionRank: z.string().optional(),
          wins: z.number().int().nonnegative().optional(),
          losses: z.number().int().nonnegative().optional(),
          leagueRecord: z
            .object({
              wins: z.number().int().nonnegative(),
              losses: z.number().int().nonnegative(),
            })
            .optional(),
          records: z
            .object({ splitRecords: z.array(splitRecordSchema).optional() })
            .optional(),
          lastUpdated: z.iso.datetime().optional(),
        }),
      ),
    }),
  ),
});

export const mlbPeopleResponseSchema = z.object({
  people: z.array(
    z.object({
      id: z.number().int().positive(),
      fullName: z.string().min(1),
      pitchHand: z.object({ code: z.enum(["L", "R"]).optional() }).optional(),
      stats: z
        .array(
          z.object({
            splits: z.array(
              z.object({
                season: z.string().optional(),
                stat: z.object({ era: z.string().optional() }),
              }),
            ),
          }),
        )
        .optional(),
    }),
  ),
});

export const savantExpectedTeamRowSchema = z.object({
  team: z.string().min(1),
  team_id: z.string().min(2).max(4),
  year: z.coerce.number().int().positive(),
  pa: z.coerce.number().int().nonnegative(),
  bip: z.coerce.number().int().nonnegative(),
  ba: z.coerce.number().nonnegative(),
  est_ba: z.coerce.number().nonnegative(),
  slg: z.coerce.number().nonnegative(),
  est_slg: z.coerce.number().nonnegative(),
  woba: z.coerce.number().nonnegative(),
  est_woba: z.coerce.number().nonnegative(),
});

export type MlbTeam = z.infer<typeof mlbTeamSchema>;
export type MlbScheduleGame = z.infer<typeof mlbScheduleGameSchema>;
export type MlbScheduleResponse = z.infer<typeof mlbScheduleResponseSchema>;
export type MlbStandingsResponse = z.infer<typeof mlbStandingsResponseSchema>;
export type MlbPerson = z.infer<
  typeof mlbPeopleResponseSchema
>["people"][number];
export type SavantExpectedTeamRow = z.infer<typeof savantExpectedTeamRowSchema>;
