import type { GameSummary, Sport } from "@/lib/contracts";

export type MarketKind =
  | "match_result"
  | "total"
  | "both_teams_to_score"
  | "exact_score"
  | "double_chance"
  | "draw_no_bet"
  | "team_threshold"
  | "clean_sheet"
  | "handicap";
export type MarketCategory = "popular" | "totals" | "teams";
export type Grade = "won" | "lost" | "void";
export type Selection = {
  id: string;
  label: string;
  price: number;
  threshold?: number;
  handicap?: number;
}; // decimal odds
export type Market = {
  id: string;
  kind: MarketKind;
  label: string;
  line?: number;
  category?: MarketCategory;
  team?: "home" | "away";
  selections: Selection[];
};

// ponytail: prices are static and identical for every game of a sport, so
// they never move with the real market. The upgrade path is a priced feed
// (planned src/providers/the-odds-api/, per Session 06-09); the Market /
// Selection shape here is what the wager schema will keep once it arrives.
export const HOUSE_PRICES_VERSION = "2026-09-21";

/**
 * Stake bounds, also the zod bounds in contracts.ts, which imports them from
 * here (this module only imports *types* from contracts.ts, so there is no
 * runtime cycle).
 *
 * **The only limit on a stake is your balance**, summed from the ledger and
 * checked inside the placement transaction in `src/data/wagers.ts` before any
 * row is written. MAX_STAKE is not a product rule: it is the column bound.
 * `wagers.stake` and `wagers.potential_return` are both `integer` (int4), and
 * a stake above INT4_MAX / the highest published price (the 3-3 exact score
 * at 34) would overflow the *return* column before the balance check could
 * ever reject it. The highest price is derived from the tables below, so
 * adding a longer price lowers the bound on its own.
 */
export const MIN_STAKE = 1;
export const INT4_MAX = 2_147_483_647;

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

// Only final-score markets belong in this catalogue. New statistics-based
// markets require verified provider coverage before placement can resolve them.
function additionalTotals(sport: Sport): Market[] {
  const unit = sport === "soccer" ? "Goals" : "Runs";
  const lines =
    sport === "soccer"
      ? [
          [1.5, 1.3, 3.2],
          [3.5, 3, 1.35],
        ]
      : [
          [6.5, 1.4, 2.75],
          [10.5, 2.75, 1.4],
        ];
  return lines.map(([line, over, under]) => ({
    id: `${sport}-total-${String(line).replace(".", "-")}`,
    kind: "total",
    category: "totals",
    label: `Over/Under ${line} ${unit}`,
    line,
    selections: [
      { id: "over", label: `Over ${line}`, price: over! },
      { id: "under", label: `Under ${line}`, price: under! },
    ],
  }));
}

function teamMarkets(sport: Sport): Market[] {
  const soccer = sport === "soccer";
  const unit = soccer ? "goals" : "runs";
  return (["home", "away"] as const).flatMap((team): Market[] => [
    {
      id: `${sport}-${team}-threshold`,
      kind: "team_threshold",
      category: "teams",
      team,
      label: soccer ? "Team goals" : "Team runs",
      selections: (soccer
        ? [
            [1, 1.35],
            [2, 2.5],
            [3, 5],
          ]
        : [
            [3, 1.45],
            [5, 2.4],
            [7, 4.5],
          ]
      ).map(([threshold, price]) => ({
        id: `${threshold}+`,
        label: `${threshold}+ ${unit}`,
        threshold,
        price: price!,
      })),
    },
    ...(soccer
      ? [
          {
            id: `${sport}-${team}-clean-sheet`,
            kind: "clean_sheet" as const,
            category: "teams" as const,
            team,
            label: "Clean sheet",
            selections: [
              { id: "yes", label: "Clean sheet: Yes", price: 2.75 },
              { id: "no", label: "Clean sheet: No", price: 1.4 },
            ],
          },
        ]
      : []),
    {
      id: `${sport}-${team}-handicap`,
      kind: "handicap",
      category: "teams",
      team,
      label: soccer ? "Goal handicap" : "Run handicap",
      selections: [
        {
          id: "minus-1-5",
          label: "Handicap -1.5",
          handicap: -1.5,
          price: soccer ? 3.75 : 2.5,
        },
        {
          id: "plus-1-5",
          label: "Handicap +1.5",
          handicap: 1.5,
          price: soccer ? 1.2 : 1.5,
        },
      ],
    },
  ]);
}

SOCCER_MARKETS.push(
  {
    id: "soccer-double-chance",
    kind: "double_chance",
    label: "Double chance",
    selections: [
      { id: "home-draw", label: "Home or draw", price: 1.35 },
      { id: "away-draw", label: "Away or draw", price: 1.5 },
      { id: "home-away", label: "Either team wins", price: 1.3 },
    ],
  },
  {
    id: "soccer-draw-no-bet",
    kind: "draw_no_bet",
    label: "Draw no bet",
    selections: [
      { id: "home", label: "Home — draw no bet", price: 1.65 },
      { id: "away", label: "Away — draw no bet", price: 2.05 },
    ],
  },
  ...additionalTotals("soccer"),
  ...teamMarkets("soccer"),
);
BASEBALL_MARKETS.push(
  ...additionalTotals("baseball"),
  ...teamMarkets("baseball"),
);

/** Self-contained labels survive history, group activity and notifications. */
export function namedSelection(
  market: Market,
  selection: Selection,
  matchup?: { home: string; away: string },
): string {
  if (matchup && market.kind === "draw_no_bet") {
    return `${selection.id === "home" ? matchup.home : matchup.away} — draw no bet`;
  }
  if (
    matchup &&
    market.kind === "double_chance" &&
    selection.id !== "home-away"
  ) {
    return `${selection.id === "home-draw" ? matchup.home : matchup.away} or draw`;
  }
  return market.team
    ? `${matchup?.[market.team] ?? (market.team === "home" ? "Home" : "Away")} — ${selection.label}`
    : selection.label;
}

export function inMarketCategory(
  market: Market,
  category: MarketCategory,
): boolean {
  if (category === "totals")
    return ["total", "both_teams_to_score", "exact_score"].includes(
      market.kind,
    );
  return (market.category ?? "popular") === category;
}

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

  const teamScore = market.team === "home" ? homeScore : awayScore;
  const opponentScore = market.team === "home" ? awayScore : homeScore;
  switch (market.kind) {
    case "double_chance": {
      const winner =
        homeScore === awayScore
          ? "draw"
          : homeScore > awayScore
            ? "home"
            : "away";
      return selectionId.split("-").includes(winner) ? "won" : "lost";
    }
    case "draw_no_bet":
      if (homeScore === awayScore) return "void";
      return (selectionId === "home") === homeScore > awayScore
        ? "won"
        : "lost";
    case "team_threshold":
      return teamScore >= selection.threshold! ? "won" : "lost";
    case "clean_sheet":
      return (selectionId === "yes") === (opponentScore === 0) ? "won" : "lost";
    case "handicap":
      return teamScore + selection.handicap! > opponentScore ? "won" : "lost";
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

/** Older wagers stored "Over" separately from its line; newer labels include it. */
export function wagerSelectionLabel(wager: {
  selectionLabel: string;
  line?: number;
}): string {
  const { selectionLabel, line } = wager;
  return line !== undefined && !selectionLabel.includes(String(line))
    ? `${selectionLabel} ${line}`
    : selectionLabel;
}

export const HIGHEST_PRICE = Math.max(
  ...[...SOCCER_MARKETS, ...BASEBALL_MARKETS].flatMap((market) =>
    market.selections.map((selection) => selection.price),
  ),
);
export const MAX_STAKE = Math.floor(INT4_MAX / HIGHEST_PRICE); // 63_161_283 at 34
