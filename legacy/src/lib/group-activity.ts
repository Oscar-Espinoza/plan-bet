import type { GameSummary, Wager } from "./contracts";

export type GroupMatchActivity = {
  canonicalGameId: string;
  game?: GameSummary;
  latestActivity: string;
  bets: { wager: Wager; userId: string }[];
};

export function groupMatchActivity(
  bets: GroupMatchActivity["bets"],
  summaries: Map<string, GameSummary>,
): GroupMatchActivity[] {
  const matches = new Map<string, GroupMatchActivity>();
  for (const bet of [...bets].sort(
    (a, b) =>
      b.wager.placedAt.localeCompare(a.wager.placedAt) ||
      a.wager.id.localeCompare(b.wager.id),
  )) {
    const id = bet.wager.canonicalGameId;
    let match = matches.get(id);
    if (!match) {
      match = {
        canonicalGameId: id,
        game: summaries.get(id),
        latestActivity: bet.wager.placedAt,
        bets: [],
      };
      matches.set(id, match);
    }
    match.bets.push(bet);
  }
  return [...matches.values()];
}

export type GroupUpcomingFixture = {
  game: GameSummary;
  bettorIds: string[];
};

/**
 * The next few fixtures on the board, each with the members who have
 * already bet on it through this group. Board games carry their route id;
 * a group bet matches when it was placed from that route or the activity's
 * own summary is that game, which covers a derby listed under both clubs.
 */
export function upcomingGroupFixtures(
  boardGames: GameSummary[],
  activity: GroupMatchActivity[],
  limit = 3,
): GroupUpcomingFixture[] {
  const now = Date.now();
  const games = boardGames
    .filter(
      (game) =>
        !(
          game.homeTeamSlug &&
          game.awayTeamSlug &&
          game.teamSlug !== game.homeTeamSlug
        ),
    )
    .filter(
      (game) =>
        game.status === "scheduled" &&
        new Date(game.scheduledAt).getTime() > now,
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    )
    .slice(0, limit);
  return games.map((game) => {
    const match = activity.find(
      (entry) =>
        entry.game?.id === game.id ||
        entry.bets.some(({ wager }) => wager.routeId === game.id),
    );
    return {
      game,
      bettorIds: [...new Set(match?.bets.map(({ userId }) => userId) ?? [])],
    };
  });
}
