import { waitUntil } from "cloudflare:workers";
import { and, eq, getTableColumns, param, sql } from "drizzle-orm";
import type { CreditSummary, GameSummary, Wager } from "../domain/contracts";
import {
  HOUSE_PRICES_VERSION,
  namedSelection,
  resolveSelection,
} from "../../shared/markets";
import { RULES_VERSION } from "../../shared/utils";
import type { WagerClosedReason } from "../../shared/wager-copy";
import { getDatabase } from "../db/client";
import { creditEntries, games, groupMembers, wagers } from "../db/schema";
import { SUMMARY_PROJECTION, getCreditSummary, toSummary } from "./credits";
import { notifyGroupWagerPlaced } from "./group-notifications";
import { isGroupMember } from "./groups-repository";
import { readGameForWager, rowToWager } from "./wagers-repository";

export type { WagerClosedReason } from "../../shared/wager-copy";

const WAGER_COLUMNS = [
  "id",
  "userId",
  "groupId",
  "canonicalGameId",
  "routeId",
  "sport",
  "marketId",
  "selectionId",
  "marketLabel",
  "selectionLabel",
  "line",
  "price",
  "stake",
  "potentialReturn",
  "matchup",
  "competition",
  "scheduledAt",
  "pricesVersion",
  "rulesVersion",
  "idempotencyKey",
  "createdAt",
] as const;

function assertWagerColumnOrder() {
  const actual = Object.keys(getTableColumns(wagers));
  if (
    actual.length !== WAGER_COLUMNS.length ||
    actual.some((key, index) => key !== WAGER_COLUMNS[index])
  ) {
    throw new Error(`wagers column order changed: ${actual.join(", ")}`);
  }
}

assertWagerColumnOrder();

/**
 * Shared by placeWager (the authoritative gate) and the game page, which
 * renders the same reason from its own snapshot. The page copy is display
 * only; the batch predicate below is what actually refuses the write.
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
 * Pre-reads choose the error a caller sees. The batch is what makes the
 * write safe: balance, kickoff/status/result, and membership are predicates
 * on the insert, and the stake row exists only when that wager id does.
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
  const db = getDatabase();

  if (input.idempotencyKey) {
    const [existing] = await db
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
        summary: await getCreditSummary(input.userId),
        replayed: true,
      };
    }
  }

  if (input.groupId && !(await isGroupMember(input.groupId, input.userId))) {
    return { ok: false, reason: "not_a_group_member" };
  }

  const game = await readGameForWager(input.routeId);
  if (!game) return { ok: false, reason: "unavailable" };

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

  if (input.price !== selection.price) {
    return { ok: false, reason: "price_moved", price: selection.price };
  }

  const now = new Date();
  const wagerId = crypto.randomUUID();
  const entryId = crypto.randomUUID();
  const groupId = input.groupId ?? null;
  const potentialReturn = Math.round(input.stake * selection.price);
  const selectionLabel = namedSelection(market, selection, {
    home: game.summary.homeTeam,
    away: game.summary.awayTeam,
  });
  const matchup = `${game.summary.awayTeam} at ${game.summary.homeTeam}`;
  const scheduledAt = new Date(game.summary.scheduledAt);

  const readBack = input.idempotencyKey
    ? db
        .select()
        .from(wagers)
        .where(
          and(
            eq(wagers.userId, input.userId),
            eq(wagers.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1)
    : db.select().from(wagers).where(eq(wagers.id, wagerId)).limit(1);

  const [, , storedRows, summaryRows] = await db.batch([
    db
      .insert(wagers)
      .select(
        sql`
        select
          ${wagerId},
          ${input.userId},
          ${param(groupId, wagers.groupId)},
          ${game.canonicalId},
          ${input.routeId},
          ${game.sport},
          ${market.id},
          ${selection.id},
          ${market.label},
          ${selectionLabel},
          ${param(market.line ?? null, wagers.line)},
          ${param(selection.price, wagers.price)},
          ${input.stake},
          ${potentialReturn},
          ${matchup},
          ${game.summary.competition},
          ${param(scheduledAt, wagers.scheduledAt)},
          ${HOUSE_PRICES_VERSION},
          ${RULES_VERSION},
          ${param(input.idempotencyKey ?? null, wagers.idempotencyKey)},
          ${param(now, wagers.createdAt)}
        where (
          select coalesce(sum(${creditEntries.amount}), 0)
          from ${creditEntries}
          where ${creditEntries.userId} = ${input.userId}
        ) >= ${input.stake}
          and exists (
            select 1 from ${games}
            where ${games.canonicalId} = ${game.canonicalId}
              and ${games.status} = 'scheduled'
              and ${games.scheduledAt} > ${param(now, games.scheduledAt)}
              and json_extract(${games.summary}, '$.result') is null
          )
          and (
            ${param(groupId, wagers.groupId)} is null
            or exists (
              select 1 from ${groupMembers}
              where ${groupMembers.groupId} = ${param(groupId, groupMembers.groupId)}
                and ${groupMembers.userId} = ${input.userId}
            )
          )
      `,
      )
      .onConflictDoNothing({
        // Bare names: SQLite matches the unique index only when the target
        // is unqualified. Drizzle's column renderer would prefix the table.
        target: sql`user_id, idempotency_key`,
      }),
    db.insert(creditEntries).select(sql`
      select
        ${entryId},
        ${input.userId},
        'stake',
        ${-input.stake},
        ${"wager placed"},
        ${wagerId},
        null,
        null,
        ${param(now, creditEntries.createdAt)}
      where exists (
        select 1 from ${wagers} where ${wagers.id} = ${wagerId}
      )
    `),
    readBack,
    db
      .select(SUMMARY_PROJECTION)
      .from(creditEntries)
      .where(eq(creditEntries.userId, input.userId)),
  ]);

  const stored = storedRows[0];
  if (stored) {
    const replayed = stored.id !== wagerId;
    const wager = rowToWager(stored);
    if (!replayed && input.groupId) {
      const placedGroupId = input.groupId;
      waitUntil(
        notifyGroupWagerPlaced({
          groupId: placedGroupId,
          actorUserId: input.userId,
          actorName: input.actorName ?? null,
          matchup: wager.matchup,
          selectionLabel: wager.selectionLabel,
          stake: wager.stake,
        }),
      );
    }
    return {
      ok: true,
      wager,
      summary: toSummary(summaryRows[0]),
      replayed,
    };
  }

  if (input.groupId && !(await isGroupMember(input.groupId, input.userId))) {
    return { ok: false, reason: "not_a_group_member" };
  }
  const gameNow = await readGameForWager(input.routeId);
  if (!gameNow) return { ok: false, reason: "unavailable" };
  const availabilityNow = evaluateWagerAvailability(gameNow.summary);
  if (!availabilityNow.open) {
    return { ok: false, reason: "closed", status: availabilityNow.reason };
  }
  return { ok: false, reason: "insufficient_balance" };
}
