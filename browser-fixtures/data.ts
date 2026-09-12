import { allGames, teams, getSnapshot } from "@/lib/seed";
import type { DashboardData } from "@/data/sports-data";
import type { Wager, WagerPlacementResult } from "@/lib/contracts";
export const board = Object.fromEntries(
  teams.map((team) => {
    const games = allGames.filter((game) => game.teamSlug === team.slug);
    const snapshot = getSnapshot(games[0]!.id)!;
    return [
      team.slug,
      { team, games, context: snapshot.context, freshness: snapshot.freshness },
    ];
  }),
) as DashboardData;
export const wager: Wager = {
  id: "11111111-1111-4111-8111-111111111111",
  routeId: "soc-rma-01",
  canonicalGameId: "football-data-1",
  sport: "soccer",
  marketId: "soccer-match-result",
  marketLabel: "Match Result",
  selectionId: "home",
  selectionLabel: "Home",
  price: 2.4,
  stake: 25,
  potentialReturn: 60,
  matchup: "Real Madrid vs Villarreal",
  competition: "LaLiga",
  scheduledAt: "2026-09-14T19:00:00.000Z",
  placedAt: "2026-09-12T12:00:00.000Z",
  settled: false,
};
export const placement: WagerPlacementResult = {
  wager,
  summary: {
    balance: 975,
    won: 0,
    lost: 0,
    voided: 0,
    lifetimeStaked: 25,
    lifetimeReturned: 0,
    resetCount: 0,
    net: -25,
  },
};
export const history: Wager[] = (["won", "lost", "void"] as const).map(
  (outcome, index) => ({
    ...wager,
    id: `wager-${index}`,
    settled: true,
    settlement: {
      outcome,
      returned: outcome === "won" ? 60 : outcome === "void" ? 25 : 0,
      settledAt: "2026-09-15T12:00:00.000Z",
      ...(outcome === "void"
        ? {}
        : { finalScore: { homeScore: 2, awayScore: 1 } }),
    },
  }),
);

export const emptyBoard: DashboardData = { ...board };
for (const team of teams)
  emptyBoard[team.slug] = { ...board[team.slug], games: [] };
