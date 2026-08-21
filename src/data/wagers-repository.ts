import "server-only";

import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { creditEntries, games, gameSnapshots, wagers } from "@/db/schema";
import {
  gameSummarySchema,
  wagerSchema,
  type Sport,
  type Wager,
  type WagerOutcome,
  type WagerSettlement,
} from "@/lib/contracts";

/**
 * The server's own copy of status, kickoff, and result — read fresh for
 * every placement rather than trusted from a cached snapshot. A route that
 * exists only in seed/demo data has no `games` row and returns nothing, which
 * is what makes it simply not placeable.
 */
export async function readGameForWager(routeId: string) {
  const [row] = await getDatabase()
    .select({
      canonicalId: games.canonicalId,
      sport: games.sport,
      summary: games.summary,
    })
    .from(gameSnapshots)
    .innerJoin(games, eq(gameSnapshots.gameId, games.id))
    .where(eq(gameSnapshots.routeId, routeId))
    .limit(1);
  if (!row) return undefined;
  return {
    canonicalId: row.canonicalId,
    sport: row.sport,
    summary: gameSummarySchema.parse(row.summary),
  };
}

export function rowToWager(
  row: typeof wagers.$inferSelect,
  settlement?: WagerSettlement,
): Wager {
  return wagerSchema.parse({
    id: row.id,
    routeId: row.routeId,
    canonicalGameId: row.canonicalGameId,
    groupId: row.groupId ?? undefined,
    sport: row.sport,
    marketId: row.marketId,
    marketLabel: row.marketLabel,
    selectionId: row.selectionId,
    selectionLabel: row.selectionLabel,
    line: row.line ?? undefined,
    price: row.price,
    stake: row.stake,
    potentialReturn: row.potentialReturn,
    matchup: row.matchup,
    competition: row.competition,
    scheduledAt: row.scheduledAt.toISOString(),
    placedAt: row.createdAt.toISOString(),
    settled: Boolean(settlement),
    settlement,
  });
}

/**
 * Open = no `credit_entries` row with kind `return` for that wager (Session
 * 09 inserts exactly one, amount 0 for a loss). A batch lookup rather than a
 * correlated subquery per row: list sizes are bounded by the caller anyway.
 * Carries the settlement itself now, not just whether one exists, so history
 * and the record view read the outcome without a second query.
 */
async function attachSettled(
  rows: (typeof wagers.$inferSelect)[],
): Promise<Wager[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const settledRows = await getDatabase()
    .select({
      wagerId: creditEntries.wagerId,
      outcome: creditEntries.outcome,
      amount: creditEntries.amount,
      settledAt: creditEntries.createdAt,
    })
    .from(creditEntries)
    .where(
      and(
        eq(creditEntries.kind, "return"),
        inArray(creditEntries.wagerId, ids),
      ),
    );
  const settlementByWagerId = new Map<string, WagerSettlement>();
  for (const row of settledRows) {
    // wagerId/outcome are only nullable in the column type because they are
    // null for every other credit_entries kind — a `return` row always sets
    // both, but narrow defensively rather than asserting.
    if (!row.wagerId || !row.outcome) continue;
    settlementByWagerId.set(row.wagerId, {
      outcome: row.outcome,
      returned: row.amount,
      settledAt: row.settledAt.toISOString(),
    });
  }

  // The score that decided each settled wager. One batch read over the games
  // these rows point at — a wager whose game row is gone keeps its stored
  // matchup and simply carries no score, never an invented one.
  const decidedGameIds = [
    ...new Set(
      rows
        .filter((row) => settlementByWagerId.has(row.id))
        .map((row) => row.canonicalGameId),
    ),
  ];
  const scoreByGameId = new Map<
    string,
    { homeScore: number; awayScore: number }
  >();
  if (decidedGameIds.length > 0) {
    const gameRows = await getDatabase()
      .select({ canonicalId: games.canonicalId, summary: games.summary })
      .from(games)
      .where(inArray(games.canonicalId, decidedGameIds));
    for (const game of gameRows) {
      const { result } = gameSummarySchema.parse(game.summary);
      if (result) {
        scoreByGameId.set(game.canonicalId, {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
        });
      }
    }
  }

  return rows.map((row) => {
    const settlement = settlementByWagerId.get(row.id);
    if (!settlement) return rowToWager(row);
    return rowToWager(row, {
      ...settlement,
      // A void was decided by nothing, so it shows no score.
      finalScore:
        settlement.outcome === "void"
          ? undefined
          : scoreByGameId.get(row.canonicalGameId),
    });
  });
}

export async function listWagersForGame(
  userId: string,
  canonicalGameId: string,
) {
  const rows = await getDatabase()
    .select()
    .from(wagers)
    .where(
      and(
        eq(wagers.userId, userId),
        eq(wagers.canonicalGameId, canonicalGameId),
      ),
    )
    .orderBy(desc(wagers.createdAt));
  return attachSettled(rows);
}

/**
 * Every group member can see every wager placed in the group, so this
 * carries `userId` alongside the wager — unlike the personal-history readers
 * above, whose caller already knows whose wagers they are.
 */
export async function listWagersForGroup(
  groupId: string,
  limit: number,
): Promise<{ wager: Wager; userId: string }[]> {
  const rows = await getDatabase()
    .select()
    .from(wagers)
    .where(eq(wagers.groupId, groupId))
    .orderBy(desc(wagers.createdAt))
    .limit(limit);
  const settled = await attachSettled(rows);
  return rows.map((row, index) => ({
    wager: settled[index]!,
    userId: row.userId,
  }));
}

export async function listWagers(userId: string, limit: number) {
  const rows = await getDatabase()
    .select()
    .from(wagers)
    .where(eq(wagers.userId, userId))
    .orderBy(desc(wagers.createdAt))
    .limit(limit);
  return attachSettled(rows);
}

export type WagerHistoryFilter = {
  sport?: Sport;
  // "open" = no return row yet, distinct from a settled outcome.
  outcome?: WagerOutcome | "open";
  since?: Date;
  // "solo" = groupId is null, "group" = groupId is set (any group).
  scope?: "solo" | "group";
  limit: number;
  offset: number;
};

/**
 * Newest first, `limit + 1` rows fetched so "there is a next page" needs no
 * separate count query — the caller slices to `limit` and treats a longer
 * result as `hasMore`. Filtering on outcome/open needs the settlement join
 * up front (a wager the plain `wagers` table alone can't answer); the actual
 * settlement payload for the returned page still comes from `attachSettled`,
 * the one place that shape is built.
 */
export async function listWagerHistory(
  userId: string,
  filter: WagerHistoryFilter,
): Promise<{ items: Wager[]; hasMore: boolean }> {
  const conditions = [eq(wagers.userId, userId)];
  if (filter.sport) conditions.push(eq(wagers.sport, filter.sport));
  if (filter.since) conditions.push(gte(wagers.createdAt, filter.since));
  if (filter.outcome === "open") {
    conditions.push(isNull(creditEntries.id));
  } else if (filter.outcome) {
    conditions.push(eq(creditEntries.outcome, filter.outcome));
  }
  if (filter.scope === "solo") conditions.push(isNull(wagers.groupId));
  else if (filter.scope === "group") conditions.push(isNotNull(wagers.groupId));

  const rows = await getDatabase()
    .select({ wager: wagers })
    .from(wagers)
    .leftJoin(
      creditEntries,
      and(
        eq(creditEntries.wagerId, wagers.id),
        eq(creditEntries.kind, "return"),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(wagers.createdAt))
    .limit(filter.limit + 1)
    .offset(filter.offset);

  const hasMore = rows.length > filter.limit;
  const page = rows.slice(0, filter.limit).map((row) => row.wager);
  return { items: await attachSettled(page), hasMore };
}

export async function countOpenWagers(userId: string): Promise<number> {
  const [row] = await getDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(wagers)
    .where(
      and(
        eq(wagers.userId, userId),
        sql`not exists (
          select 1 from ${creditEntries}
          where ${creditEntries.wagerId} = ${wagers.id} and ${creditEntries.kind} = 'return'
        )`,
      ),
    );
  return row?.count ?? 0;
}
