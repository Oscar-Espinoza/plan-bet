import { waitUntil } from "cloudflare:workers";
import { and, eq, getTableColumns, param, sql } from "drizzle-orm";
import {
  gameStatusSchema,
  type CreditSummary,
  type GameSummary,
  type Sport,
  type Wager,
} from "../domain/contracts";
import {
  HOUSE_PRICES_VERSION,
  namedSelection,
  resolveSelection,
} from "../../shared/markets";
import { RULES_VERSION } from "../../shared/utils";
import type { WagerClosedReason } from "../../shared/wager-copy";
import { getDatabase } from "../db/client";
import { logEvent } from "../logger";
import { creditEntries, games, groupMembers, wagers } from "../db/schema";
import {
  SUMMARY_PROJECTION,
  getCreditSummary,
  readBalance,
  toSummary,
} from "./credits";
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

type PlacementIdentity = {
  userId: string;
  idempotencyKey?: string;
};

/**
 * A key that already has a wager is that wager, even when a later check would
 * now reject a fresh placement. Legacy did this under its lock; we do it
 * before the batch and again immediately before every rejection.
 */
async function placedWager(
  userId: string,
  idempotencyKey: string | undefined,
): Promise<PlaceWagerResult | undefined> {
  if (!idempotencyKey) return undefined;
  const [existing] = await getDatabase()
    .select()
    .from(wagers)
    .where(
      and(eq(wagers.userId, userId), eq(wagers.idempotencyKey, idempotencyKey)),
    )
    .limit(1);
  if (!existing) return undefined;
  return {
    ok: true,
    wager: rowToWager(existing),
    summary: await getCreditSummary(userId),
    replayed: true,
  };
}

async function rejectUnlessPlaced(
  input: PlacementIdentity,
  failure: Exclude<PlaceWagerResult, { ok: true }>,
): Promise<PlaceWagerResult> {
  return (await placedWager(input.userId, input.idempotencyKey)) ?? failure;
}

/**
 * Openness of the games row the insert actually matched: the status column,
 * scheduled_at, and a stored result. The summary JSON can disagree with
 * scheduled_at; this read is what names that refusal.
 */
async function gamesRowClosedReason(
  canonicalGameId: string,
): Promise<
  { missing: true } | { missing: false; closed: WagerClosedReason | null }
> {
  const [row] = await getDatabase()
    .select({
      status: games.status,
      scheduledAt: games.scheduledAt,
      result: sql<string | null>`json_extract(${games.summary}, '$.result')`,
    })
    .from(games)
    .where(eq(games.canonicalId, canonicalGameId))
    .limit(1);
  if (!row) return { missing: true };
  const parsed = gameStatusSchema.safeParse(row.status);
  if (!parsed.success) return { missing: false, closed: "unknown" };
  if (parsed.data !== "scheduled")
    return { missing: false, closed: parsed.data };
  const kickoff = row.scheduledAt?.getTime() ?? 0;
  if (kickoff <= Date.now()) return { missing: false, closed: "started" };
  if (row.result != null) return { missing: false, closed: "finished" };
  return { missing: false, closed: null };
}

export type CommitPlacementInput = {
  userId: string;
  routeId: string;
  canonicalGameId: string;
  sport: Sport;
  marketId: string;
  selectionId: string;
  marketLabel: string;
  selectionLabel: string;
  line: number | null;
  price: number;
  stake: number;
  potentialReturn: number;
  matchup: string;
  competition: string;
  scheduledAt: Date;
  groupId?: string;
  idempotencyKey?: string;
};

/**
 * The write batch and nothing before it. Balance, the games row, and
 * membership are predicates on the insert. The stake row exists only when
 * that wager id does. placeWager calls this after its pre-reads; the money
 * scenario calls it directly so those predicates are actually exercised.
 */
export async function commitPlacement(
  input: CommitPlacementInput,
): Promise<PlaceWagerResult> {
  const db = getDatabase();
  const now = new Date();
  const wagerId = crypto.randomUUID();
  const entryId = crypto.randomUUID();
  const groupId = input.groupId ?? null;

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
          ${input.canonicalGameId},
          ${input.routeId},
          ${input.sport},
          ${input.marketId},
          ${input.selectionId},
          ${input.marketLabel},
          ${input.selectionLabel},
          ${param(input.line, wagers.line)},
          ${param(input.price, wagers.price)},
          ${input.stake},
          ${input.potentialReturn},
          ${input.matchup},
          ${input.competition},
          ${param(input.scheduledAt, wagers.scheduledAt)},
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
            where ${games.canonicalId} = ${input.canonicalGameId}
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
    return {
      ok: true,
      wager: rowToWager(stored),
      summary: toSummary(summaryRows[0]),
      replayed: stored.id !== wagerId,
    };
  }

  return explainFailedPlacement(input);
}

/**
 * The insert wrote nothing. Name the reason from a fresh read. Balance is
 * insufficient only when it is actually short; a games row that is shut
 * (including a scheduled_at that disagrees with the summary) is closed or
 * unavailable. Anything else is logged — the write was refused and no
 * predicate we re-read explains it.
 */
async function explainFailedPlacement(
  input: CommitPlacementInput,
): Promise<PlaceWagerResult> {
  const replay = await placedWager(input.userId, input.idempotencyKey);
  if (replay) return replay;

  if (input.groupId && !(await isGroupMember(input.groupId, input.userId))) {
    return rejectUnlessPlaced(input, {
      ok: false,
      reason: "not_a_group_member",
    });
  }

  const balance = await readBalance(input.userId);
  if (balance < input.stake) {
    return rejectUnlessPlaced(input, {
      ok: false,
      reason: "insufficient_balance",
    });
  }

  const game = await gamesRowClosedReason(input.canonicalGameId);
  if (game.missing) {
    return rejectUnlessPlaced(input, { ok: false, reason: "unavailable" });
  }
  if (game.closed) {
    return rejectUnlessPlaced(input, {
      ok: false,
      reason: "closed",
      status: game.closed,
    });
  }

  logEvent("warn", "wager_placement_unexplained", {
    userId: input.userId,
    routeId: input.routeId,
    canonicalGameId: input.canonicalGameId,
    stake: input.stake,
    balance,
  });
  return rejectUnlessPlaced(input, { ok: false, reason: "unavailable" });
}

/**
 * Pre-reads choose the error a caller sees. commitPlacement is what makes
 * the write safe.
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
  const already = await placedWager(input.userId, input.idempotencyKey);
  if (already) return already;

  if (input.groupId && !(await isGroupMember(input.groupId, input.userId))) {
    return rejectUnlessPlaced(input, {
      ok: false,
      reason: "not_a_group_member",
    });
  }

  const game = await readGameForWager(input.routeId);
  if (!game) {
    return rejectUnlessPlaced(input, { ok: false, reason: "unavailable" });
  }

  const resolved = resolveSelection(
    game.sport,
    input.marketId,
    input.selectionId,
  );
  if (!resolved) {
    return rejectUnlessPlaced(input, {
      ok: false,
      reason: "invalid_selection",
    });
  }
  const { market, selection } = resolved;

  const availability = evaluateWagerAvailability(game.summary);
  if (!availability.open) {
    return rejectUnlessPlaced(input, {
      ok: false,
      reason: "closed",
      status: availability.reason,
    });
  }

  if (input.price !== selection.price) {
    return rejectUnlessPlaced(input, {
      ok: false,
      reason: "price_moved",
      price: selection.price,
    });
  }

  const result = await commitPlacement({
    userId: input.userId,
    routeId: input.routeId,
    canonicalGameId: game.canonicalId,
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
    groupId: input.groupId,
    idempotencyKey: input.idempotencyKey,
  });

  if (result.ok && !result.replayed && input.groupId) {
    const placedGroupId = input.groupId;
    waitUntil(
      notifyGroupWagerPlaced({
        groupId: placedGroupId,
        actorUserId: input.userId,
        actorName: input.actorName ?? null,
        matchup: result.wager.matchup,
        selectionLabel: result.wager.selectionLabel,
        stake: result.wager.stake,
      }),
    );
  }

  return result;
}
