import type { GameSummary, Sport } from "@/lib/contracts";

export type MarketKind =
  "match_result" | "total" | "both_teams_to_score" | "exact_score";
export type Grade = "won" | "lost" | "void";
export type Selection = { id: string; label: string; price: number }; // decimal odds
export type Market = {
  id: string;
  kind: MarketKind;
  label: string;
  line?: number;
  selections: Selection[];
};

// ponytail: prices are static and identical for every game of a sport, so
// they never move with the real market. The upgrade path is a priced feed
// (planned src/providers/the-odds-api/, per Session 06-09); the Market /
// Selection shape here is what the wager schema will keep once it arrives.
export const HOUSE_PRICES_VERSION = "2026-08-20";

// Published stake bounds. contracts.ts mirrors these as literal zod bounds
// (it cannot import this module without a cycle, since this module already
// imports Sport/GameSummary from contracts.ts) — keep the two in sync.
export const MIN_STAKE = 1;
export const MAX_STAKE = 500;

const SOCCER_EXACT_SCORE_PRICES = {
  "0-0": 11,
  "1-0": 7.5,
  "0-1": 9.5,
  "1-1": 6.5,
  "2-0": 11,
  "0-2": 15,
  "2-1": 8.5,
  "1-2": 11,
  "2-2": 13,
  "3-0": 21,
  "0-3": 26,
  "3-1": 17,
  "1-3": 19,
  "3-2": 23,
  "2-3": 26,
  "3-3": 34,
} as const satisfies Record<string, number>;

const SOCCER_MARKETS: Market[] = [
  {
    id: "soccer-match-result",
    kind: "match_result",
    label: "Match Result",
    selections: [
      { id: "home", label: "Home", price: 2.4 },
      { id: "draw", label: "Draw", price: 3.5 },
      { id: "away", label: "Away", price: 3.0 },
    ],
  },
  {
    id: "soccer-total-2-5",
    kind: "total",
    label: "Over/Under 2.5 Goals",
    line: 2.5,
    selections: [
      { id: "over", label: "Over 2.5", price: 1.9 },
      { id: "under", label: "Under 2.5", price: 1.9 },
    ],
  },
  {
    id: "soccer-btts",
    kind: "both_teams_to_score",
    label: "Both Teams to Score",
    selections: [
      { id: "yes", label: "Yes", price: 1.85 },
      { id: "no", label: "No", price: 1.95 },
    ],
  },
  {
    id: "soccer-exact-score",
    kind: "exact_score",
    label: "Exact Score",
    // No "any other score" bucket by design: a scoreline outside this grid
    // loses every selection here rather than paying out an extra one.
    selections: Object.entries(SOCCER_EXACT_SCORE_PRICES).map(
      ([score, price]) => ({ id: score, label: score, price }),
    ),
  },
];

const BASEBALL_MARKETS: Market[] = [
  {
    id: "baseball-moneyline",
    kind: "match_result",
    label: "Moneyline",
    // No draw selection: baseball plays to a decision.
    selections: [
      { id: "home", label: "Home", price: 1.85 },
      { id: "away", label: "Away", price: 1.95 },
    ],
  },
  {
    id: "baseball-total-8-5",
    kind: "total",
    label: "Over/Under 8.5 Runs",
    line: 8.5,
    selections: [
      { id: "over", label: "Over 8.5", price: 1.9 },
      { id: "under", label: "Under 8.5", price: 1.9 },
    ],
  },
  // both_teams_to_score is omitted: both teams batting means it's near-
  // certain in MLB, so a priced market on it would be a near-guaranteed win.
  // exact_score is omitted: a 0-3 grid (sized for soccer) misses most MLB
  // finals, which routinely run higher.
];

export function marketsFor(sport: Sport): Market[] {
  return sport === "soccer" ? SOCCER_MARKETS : BASEBALL_MARKETS;
}

/**
 * The single lookup the slip, the placement route, and Session 09's
 * settlement all go through. An unknown market or selection id returns
 * `undefined` — nothing downstream invents one.
 */
export function resolveSelection(
  sport: Sport,
  marketId: string,
  selectionId: string,
): { market: Market; selection: Selection } | undefined {
  const market = marketsFor(sport).find((m) => m.id === marketId);
  if (!market) return undefined;
  const selection = market.selections.find((s) => s.id === selectionId);
  if (!selection) return undefined;
  return { market, selection };
}

export function gradeSelection(
  market: Market,
  selectionId: string,
  game: GameSummary,
): Grade {
  const selection = market.selections.find((s) => s.id === selectionId);
  if (!selection) {
    // Unknown selection id is a programming error (a stale link, a typo'd
    // wager), never a runtime state to grade around.
    throw new Error(
      `Unknown selection "${selectionId}" for market "${market.id}"`,
    );
  }

  if (game.status === "cancelled" || game.status === "postponed") {
    return "void";
  }

  const { result } = game;
  if (!result) return "void";

  // Our published rules settle soccer on 90 minutes plus stoppage, but the
  // provider's full-time score on a knockout tie includes extra time /
  // penalties, so that score must never grade a 90-minute market. Baseball
  // never reports `completion` at all — absent must not trigger this.
  if (
    game.sport === "soccer" &&
    (result.completion === "extra" || result.completion === "shootout")
  ) {
    return "void";
  }

  const { homeScore, awayScore } = result;

  switch (market.kind) {
    case "match_result": {
      const winner =
        homeScore === awayScore
          ? "draw"
          : homeScore > awayScore
            ? "home"
            : "away";
      const hasDraw = market.selections.some((s) => s.id === "draw");
      // Baseball has no draw selection, so an equal score (which MLB does
      // not produce) has no correct selection to grade "won" — void it.
      if (winner === "draw" && !hasDraw) return "void";
      return selectionId === winner ? "won" : "lost";
    }
    case "total": {
      const total = homeScore + awayScore;
      // ponytail: every published line ends in .5, so a push cannot arise;
      // add the equality branch if a whole-number line is ever listed.
      const over = total > market.line!;
      return (selectionId === "over") === over ? "won" : "lost";
    }
    case "both_teams_to_score": {
      const bothScored = homeScore > 0 && awayScore > 0;
      return (selectionId === "yes") === bothScored ? "won" : "lost";
    }
    case "exact_score": {
      // Selection ids are the scoreline itself ("2-1"), so a scoreline
      // outside the published grid simply matches no selection and loses.
      return selectionId === `${homeScore}-${awayScore}` ? "won" : "lost";
    }
  }
}
