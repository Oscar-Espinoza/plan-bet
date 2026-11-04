import "server-only";

import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { notifyGroupWagerPlaced } from "@/data/group-notifications";
import { isGroupMember } from "@/data/groups-repository";
import { readGameForWager, rowToWager } from "@/data/wagers-repository";
import {
  SUMMARY_PROJECTION,
  lockAccountBalance,
  readLockedBalance,
  toSummary,
} from "@/data/credits";
import { withDatabaseTransaction } from "@/db/client";
import { creditEntries, wagers } from "@/db/schema";
import type { CreditSummary, GameSummary, Wager } from "@/lib/contracts";
import {
  HOUSE_PRICES_VERSION,
  namedSelection,
  resolveSelection,
} from "@/lib/markets";
import { RULES_VERSION } from "@/lib/utils";
// Declared in wager-copy.ts, which is not `server-only` so the client slip
// can import it too — re-exported here so this file's own callers (the
// placement route, wagers-repository) are unchanged.
import type { WagerClosedReason } from "@/lib/wager-copy";
export type { WagerClosedReason } from "@/lib/wager-copy";

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
  | { ok: true; wager: Wager; summary: CreditSummary; replayed: boolean }
  | { ok: false; reason: "invalid_selection" }
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "closed"; status: WagerClosedReason }
  | { ok: false; reason: "price_moved"; price: number }
  | { ok: false; reason: "insufficient_balance" }
  | { ok: false; reason: "not_a_group_member" };

/**
 * Never throws for an expected outcome — every rejection is a discriminated
 * result. Everything runs after the per-account balance lock (classid 4,
 * shared with the bankroll reset — see lockAccountBalance): the idempotency
 * lookup, the game read and availability check, the balance check, and the
 * wager + stake ledger inserts. Checking availability only after the lock is
 * the point — a request that queued behind another placement across kickoff
 * sees the game as it is now, not as it was when the request arrived.
 */
export async function placeWager(input: {
  userId: string;
  routeId: string;
  marketId: string;
  selectionId: string;
  price: number;
  stake: number;
  groupId?: string;
  actorName?: string | null;
  idempotencyKey?: string;
}): Promise<PlaceWagerResult> {
  const result = await withDatabaseTransaction(
    async (transaction): Promise<PlaceWagerResult> => {
      await lockAccountBalance(transaction, input.userId);

      const readSummary = async () => {
        const [summaryRow] = await transaction
          .select(SUMMARY_PROJECTION)
          .from(creditEntries)
          .where(eq(creditEntries.userId, input.userId));
        return toSummary(summaryRow);
      };

      // First, before any check that could have changed since: a retry of a
      // placement that already committed returns that wager, even if the
      // game has since kicked off or the balance no longer covers it. The
      // unique index backs this up; the lock is what makes the lookup exact.
      if (input.idempotencyKey) {
        const [existing] = await transaction
          .select()
          .from(wagers)
          .where(
            and(
              eq(wagers.userId, input.userId),
              eq(wagers.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (existing) {
          return {
            ok: true,
            wager: rowToWager(existing),
            summary: await readSummary(),
            replayed: true,
          };
        }
      }

      // A client-supplied groupId is never trusted alone — same boundary as
      // price.
      if (
        input.groupId &&
        !(await isGroupMember(input.groupId, input.userId))
      ) {
        return { ok: false, reason: "not_a_group_member" };
      }

      const game = await readGameForWager(input.routeId);
      if (!game) return { ok: false, reason: "unavailable" };

      // The catalogue is keyed by sport, and sport is only known once the
      // game is read — so this runs after the game lookup rather than before
      // it, even though it is the conceptually prior check.
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

      const balance = await readLockedBalance(transaction, input.userId);
      if (input.stake > balance) {
        return { ok: false, reason: "insufficient_balance" };
      }

      const [wagerRow] = await transaction
        .insert(wagers)
        .values({
          userId: input.userId,
          groupId: input.groupId ?? null,
          canonicalGameId: game.canonicalId,
          routeId: input.routeId,
          sport: game.sport,
          marketId: market.id,
          selectionId: selection.id,
          marketLabel: market.label,
          selectionLabel: namedSelection(market, selection, {
            home: game.summary.homeTeam,
            away: game.summary.awayTeam,
          }),
          line: market.line ?? null,
          price: selection.price,
          stake: input.stake,
          potentialReturn: Math.round(input.stake * selection.price),
          matchup: `${game.summary.awayTeam} at ${game.summary.homeTeam}`,
          competition: game.summary.competition,
          scheduledAt: new Date(game.summary.scheduledAt),
          pricesVersion: HOUSE_PRICES_VERSION,
          rulesVersion: RULES_VERSION,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning();

      await transaction.insert(creditEntries).values({
        userId: input.userId,
        kind: "stake",
        amount: -input.stake,
        reason: "wager placed",
        wagerId: wagerRow!.id,
      });

      return {
        ok: true,
        // Freshly inserted: no return row can exist yet, so settled is always
        // false here.
        wager: rowToWager(wagerRow!),
        summary: await readSummary(),
        replayed: false,
      };
    },
  );

  // After the commit and off the response path: a mail provider must not
  // hold the transaction open or delay the confirmation, and a notification
  // that fails must not roll a placed wager back. A replay already notified
  // the first time. notifyGroupWagerPlaced swallows its own failures.
  if (result.ok && !result.replayed && input.groupId) {
    const { groupId } = input;
    const { wager } = result;
    after(() =>
      notifyGroupWagerPlaced({
        groupId,
        actorUserId: input.userId,
        actorName: input.actorName ?? null,
        matchup: wager.matchup,
        selectionLabel: wager.selectionLabel,
        stake: wager.stake,
      }),
    );
  }

  return result;
}
