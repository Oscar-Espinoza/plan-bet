import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { creditEntries, games, gameSnapshots, wagers } from "@/db/schema";
import { gameSummarySchema, wagerSchema, type Wager } from "@/lib/contracts";

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
  settled: boolean,
): Wager {
  return wagerSchema.parse({
    id: row.id,
    routeId: row.routeId,
    canonicalGameId: row.canonicalGameId,
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
    settled,
  });
}

/**
 * Open = no `credit_entries` row with kind `return` for that wager (Session
 * 09 inserts exactly one, amount 0 for a loss). A batch lookup rather than a
 * correlated subquery per row: list sizes are bounded by the caller anyway.
 */
async function attachSettled(
  rows: (typeof wagers.$inferSelect)[],
): Promise<Wager[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const settledRows = await getDatabase()
    .select({ wagerId: creditEntries.wagerId })
    .from(creditEntries)
    .where(
      and(
        eq(creditEntries.kind, "return"),
        inArray(creditEntries.wagerId, ids),
      ),
    );
  const settledIds = new Set(settledRows.map((row) => row.wagerId));
  return rows.map((row) => rowToWager(row, settledIds.has(row.id)));
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

export async function listWagers(userId: string, limit: number) {
  const rows = await getDatabase()
    .select()
    .from(wagers)
    .where(eq(wagers.userId, userId))
    .orderBy(desc(wagers.createdAt))
    .limit(limit);
  return attachSettled(rows);
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
