import { z } from "zod";

/**
 * apifootball returns every number as a string, so each field is coerced here
 * rather than at the twenty call sites downstream. The MCP layer already
 * supplies `kickoff_utc`; the raw `date`/`time` pair is in an account-dependent
 * zone the vendor's own `timezone` parameter does not fix, so it is not read.
 */
const numeric = z.coerce.number();

export type ApiFootballMatch = {
  id: string;
  kickoff: string;
  status: string;
  leagueId: string;
  league: string;
  homeTeamId: string;
  homeTeam: string;
  awayTeamId: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
};

const score = z
  .string()
  .optional()
  .transform((value) =>
    value === undefined || value.trim() === "" ? undefined : Number(value),
  );

const matchSchema = z
  .object({
    match_id: z.string(),
    kickoff_utc: z.iso.datetime(),
    status: z.string().default(""),
    league_id: z.string(),
    league: z.string(),
    home_team: z.string(),
    home_team_id: z.string(),
    away_team: z.string(),
    away_team_id: z.string(),
    home_score: score,
    away_score: score,
  })
  .transform((row): ApiFootballMatch => ({
    id: row.match_id,
    kickoff: row.kickoff_utc,
    status: row.status,
    leagueId: row.league_id,
    league: row.league,
    homeTeamId: row.home_team_id,
    homeTeam: row.home_team,
    awayTeamId: row.away_team_id,
    awayTeam: row.away_team,
    homeScore: row.home_score,
    awayScore: row.away_score,
  }));

export const apiFootballMatchesSchema = z
  .object({ matches: z.array(matchSchema) })
  .transform((value) => value.matches);

export const apiFootballHeadToHeadSchema = z
  .object({
    head_to_head: z.array(matchSchema).default([]),
    team1_recent_form: z.array(matchSchema).default([]),
    team2_recent_form: z.array(matchSchema).default([]),
  })
  .transform((value) => ({
    meetings: value.head_to_head,
    homeForm: value.team1_recent_form,
    awayForm: value.team2_recent_form,
  }));

/**
 * The percentages are carried through so `buildFacts` can judge whether a
 * fixture is lopsided or close, but no fact ever states one — CLAUDE.md forbids
 * the buddy quoting a probability, and these numbers are visibly rough (one
 * fixture read 86/1/1).
 */
export type ApiFootballPrediction = {
  matchId: string;
  favorite: "home" | "away" | "draw";
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  bothTeamsScorePct: number;
  overTwoFivePct: number;
};

export const apiFootballPredictionsSchema = z
  .object({
    predictions: z.array(
      z
        .object({
          match_id: z.string(),
          favorite: z.enum(["home", "away", "draw"]),
          home_win_pct: numeric,
          draw_pct: numeric,
          away_win_pct: numeric,
          both_teams_score_pct: numeric.default(0),
          over_2_5_goals_pct: numeric.default(0),
        })
        .transform((row): ApiFootballPrediction => ({
          matchId: row.match_id,
          favorite: row.favorite,
          homeWinPct: row.home_win_pct,
          drawPct: row.draw_pct,
          awayWinPct: row.away_win_pct,
          bothTeamsScorePct: row.both_teams_score_pct,
          overTwoFivePct: row.over_2_5_goals_pct,
        })),
    ),
  })
  .transform((value) => value.predictions);

export type ApiFootballStandingRow = {
  position: number;
  teamId: string;
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

export const apiFootballStandingsSchema = z
  .object({
    table: z.array(
      z
        .object({
          position: numeric,
          team_id: z.string(),
          team: z.string(),
          played: numeric,
          wins: numeric,
          draws: numeric,
          losses: numeric,
          goals_for: numeric,
          goals_against: numeric,
          points: numeric,
        })
        .transform((row): ApiFootballStandingRow => ({
          position: row.position,
          teamId: row.team_id,
          team: row.team,
          played: row.played,
          wins: row.wins,
          draws: row.draws,
          losses: row.losses,
          goalsFor: row.goals_for,
          goalsAgainst: row.goals_against,
          points: row.points,
        })),
    ),
  })
  .transform((value) => value.table);
