import "server-only";

import { eq, sql } from "drizzle-orm";
import { readGameForWager, rowToWager } from "@/data/wagers-repository";
import { SUMMARY_PROJECTION, toSummary } from "@/data/credits";
import { withDatabaseTransaction } from "@/db/client";
import { creditEntries, wagers } from "@/db/schema";
import type {
  CreditSummary,
  GameStatus,
  GameSummary,
  Wager,
} from "@/lib/contracts";
import { HOUSE_PRICES_VERSION, resolveSelection } from "@/lib/markets";
import { RULES_VERSION } from "@/lib/rules";

// "started" isn't a stored GameStatus — it's what a scheduled game becomes
// once kickoff passes with no status update yet. The game-state guard this
// session ships instead of an odds-staleness tolerance (see the session 08
// plan's deviations).
export type WagerClosedReason = GameStatus | "started";

/**
 * Shared by placeWager (the authoritative, server-side gate) and the game
 * page (which renders the same reason ahead of any submission attempt, from
 * the page's own cached snapshot — a display convenience only).
 */
export function evaluateWagerAvailability(
  summary: GameSummary,
): { open: true } | { open: false; reason: WagerClosedReason } {
  if (summary.status !== "scheduled") {
    return { open: false, reason: summary.status };
  }
  if (new Date(summary.scheduledAt).getTime() <= Date.now()) {
    return { open: false, reason: "started" };
  }
  if (summary.result) {
    return { open: false, reason: "finished" };
  }
  return { open: true };
}

export type PlaceWagerResult =
  | { ok: true; wager: Wager; summary: CreditSummary }
  | { ok: false; reason: "invalid_selection" }
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "closed"; status: WagerClosedReason }
  | { ok: false; reason: "price_moved"; price: number }
  | { ok: false; reason: "insufficient_balance" };

/**
 * Never throws for an expected outcome — every rejection is a discriminated
 * result. The DB round trip inside `withDatabaseTransaction` is the only
 * place anything is written: balance check, wager insert, and stake ledger
 * entry happen atomically under a per-account advisory lock (classid 4 — 1
 * and 2 are the briefing session/IP quotas, 3 is the bankroll reset).
 */
export async function placeWager(input: {
  userId: string;
  routeId: string;
  marketId: string;
  selectionId: string;
  price: number;
  stake: number;
}): Promise<PlaceWagerResult> {
  const game = await readGameForWager(input.routeId);
  if (!game) return { ok: false, reason: "unavailable" };

  // The catalogue is keyed by sport, and sport is only known once the game
  // is read — so this runs after the game lookup rather than before it, even
  // though it is the conceptually prior check.
  const resolved = resolveSelection(
    game.sport,
    input.marketId,
    input.selectionId,
  );
  if (!resolved) return { ok: false, reason: "invalid_selection" };
  const { market, selection } = resolved;

  const availability = evaluateWagerAvailability(game.summary);
  if (!availability.open) {
    return { ok: false, reason: "closed", status: availability.reason };
  }

  // The client's number is only ever compared, never stored.
  if (input.price !== selection.price) {
    return { ok: false, reason: "price_moved", price: selection.price };
  }

  const potentialReturn = Math.round(input.stake * selection.price);

  return withDatabaseTransaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(4, hashtext(${input.userId}))`,
    );

    const [balanceRow] = await transaction
      .select({
        balance: sql<number>`coalesce(sum(${creditEntries.amount}), 0)::int`,
      })
      .from(creditEntries)
      .where(eq(creditEntries.userId, input.userId));
    const balance = balanceRow?.balance ?? 0;

    if (input.stake > balance) {
      return { ok: false, reason: "insufficient_balance" } as const;
    }

    const [wagerRow] = await transaction
      .insert(wagers)
      .values({
        userId: input.userId,
        canonicalGameId: game.canonicalId,
        routeId: input.routeId,
        sport: game.sport,
        marketId: market.id,
        selectionId: selection.id,
        marketLabel: market.label,
        selectionLabel: selection.label,
        line: market.line ?? null,
        price: selection.price,
        stake: input.stake,
        potentialReturn,
        matchup: `${game.summary.awayTeam} at ${game.summary.homeTeam}`,
        competition: game.summary.competition,
        scheduledAt: new Date(game.summary.scheduledAt),
        pricesVersion: HOUSE_PRICES_VERSION,
        rulesVersion: RULES_VERSION,
      })
      .returning();

    await transaction.insert(creditEntries).values({
      userId: input.userId,
      kind: "stake",
      amount: -input.stake,
      reason: "wager placed",
      wagerId: wagerRow!.id,
    });

    const [summaryRow] = await transaction
      .select(SUMMARY_PROJECTION)
      .from(creditEntries)
      .where(eq(creditEntries.userId, input.userId));

    return {
      ok: true,
      // Freshly inserted: no return row can exist yet, so settled is always
      // false here.
      wager: rowToWager(wagerRow!),
      summary: toSummary(summaryRow),
    } as const;
  });
}
