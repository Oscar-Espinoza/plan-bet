import { z } from "zod";

/**
 * BigBalls returns odds alongside every match (`has_odds`). This app publishes
 * its own fixed house prices and licenses none from a bookmaker (`07b`), so the
 * field is dropped here at the schema boundary rather than merely left unread —
 * nothing downstream can reach for it by accident.
 */
export type BigBallsMatch = {
  id: string;
  kickoff: string;
  status: string;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
};

const team = z.object({ name: z.string().min(1) });

const matchSchema = z
  .object({
    id: z.string().min(1),
    kickoff_utc: z.iso.datetime(),
    status: z.string().min(1),
    home: team,
    away: team,
    score: z
      .object({ home: z.number().int(), away: z.number().int() })
      .nullish(),
  })
  .transform((row): BigBallsMatch => ({
    id: row.id,
    kickoff: row.kickoff_utc,
    status: row.status,
    homeTeam: row.home.name,
    awayTeam: row.away.name,
    homeScore: row.score?.home,
    awayScore: row.score?.away,
  }));

export const bigBallsMatchesSchema = z.array(matchSchema);

export type BigBallsStandingRow = {
  teamId: string;
  team: string;
  rank: number;
  wins: number;
  losses: number;
  winPct: number;
  gamesPlayed: number;
  runsFor: number;
  runsAgainst: number;
  streak: string;
};

/**
 * `points_for`/`points_against` are the vendor's sport-neutral names; for
 * baseball they are runs, and they are renamed here so a fact never says
 * "points" about a ballgame.
 */
export const bigBallsStandingsSchema = z
  .object({
    standings: z.array(
      z.object({
        rows: z.array(
          z
            .object({
              team_id: z.string().min(1),
              team_name: z.string().min(1),
              rank: z.number().int(),
              wins: z.number().int(),
              losses: z.number().int(),
              win_pct: z.number(),
              games_played: z.number().int(),
              points_for: z.number().int(),
              points_against: z.number().int(),
              streak: z.string().default(""),
            })
            .transform((row): BigBallsStandingRow => ({
              teamId: row.team_id,
              team: row.team_name,
              rank: row.rank,
              wins: row.wins,
              losses: row.losses,
              winPct: row.win_pct,
              gamesPlayed: row.games_played,
              runsFor: row.points_for,
              runsAgainst: row.points_against,
              streak: row.streak,
            })),
        ),
      }),
    ),
  })
  .transform((value) => value.standings.flatMap((league) => league.rows));
