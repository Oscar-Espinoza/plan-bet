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
