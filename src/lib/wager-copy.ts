import type { GameStatus } from "@/lib/contracts";

// Mirrors WagerClosedReason in src/data/wagers.ts, which re-exports this
// type so its callers are unchanged. Duplicated here (rather than imported)
// because src/data/wagers.ts is `server-only` and this file is imported by
// both the client slip and the server route — see the module comment below.
export type WagerClosedReason = GameStatus | "started";

/**
 * The one copy of the closed/price-moved copy, shared by the placement
 * route (src/app/api/bets/route.ts) and the slip (src/components/bet-slip.tsx).
 * No `server-only`: that import would make this file unimportable from the
 * client slip, which is the entire reason this file exists instead of the
 * slip redeclaring the type and copying the map from src/data/wagers.ts.
 * Every entry names a next action (principle 5 — never dead-end).
 */
export const CLOSED_COPY: Record<WagerClosedReason, string> = {
  // Unreachable: scheduled is the open state, so a wager is never placed
  // against it. Kept so this map stays a total function over the type.
  scheduled: "This game is not open for wagers.",
  started: "This game has already started. Check the slate for what's next.",
  live: "This game is already in progress. Check the slate for what's next.",
  finished: "This game has finished. Your record is on /you.",
  postponed: "This game has been postponed. Check back for a new time.",
  cancelled: "This game has been cancelled and will not be replayed.",
  unknown: "This game is not open for wagers.",
};

export function priceMovedCopy(price: number) {
  return `The price moved to ${price.toFixed(2)}. Tap the selection again to place at the new price.`;
}
