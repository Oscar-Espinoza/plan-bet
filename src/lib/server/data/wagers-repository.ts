import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import { groupMatchActivity } from "../../shared/group-activity";
import { getDatabase, type Database } from "../db/client";
import {
  creditEntries,
  games,
  gameSnapshots,
  groupMembers,
  groups,
  user,
  wagers,
} from "../db/schema";
import {
  gameSummarySchema,
  recordSlicesSchema,
  wagerSchema,
  type RecordSlices,
  type Sport,
  type Wager,
  type WagerOutcome,
  type WagerSettlement,
} from "../domain/contracts";

export function openWagerCountQuery(db: Database, userId: string) {
  return db
    .select({ count: sql<number>`count(*)` })
    .from(wagers)
    .where(
      and(
        eq(wagers.userId, userId),
        sql`not exists (
          select 1 from ${creditEntries}
          where ${creditEntries.wagerId} = ${wagers.id}
            and ${creditEntries.kind} = 'return'
        )`,
      ),
    );
}

/** Open wagers for one user. The account chip batches this query. */
export async function countOpenWagers(userId: string): Promise<number> {
  const [row] = await openWagerCountQuery(getDatabase(), userId);
  return row?.count ?? 0;
}

function toIso(value: Date | number | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toSafeInteger(value: unknown): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new RangeError(`Ledger aggregate out of range: ${String(value)}`);
  }
  return number;
}

/**
 * The server's own copy of status, kickoff, and result, read fresh for
 * every placement. A route that exists only in seed data has no games row
 * and is not placeable.
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
    scheduledAt: toIso(row.scheduledAt),
    placedAt: toIso(row.createdAt),
    settled: Boolean(settlement),
    settlement,
  });
}

/**
 * Open means no credit_entries row with kind `return`. Settlement and the
 * deciding score come back with the rows so history does not query twice.
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
    if (!row.wagerId || !row.outcome) continue;
    settlementByWagerId.set(row.wagerId, {
      outcome: row.outcome,
      returned: row.amount,
      settledAt: toIso(row.settledAt),
    });
  }

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
      finalScore:
        settlement.outcome === "void"
          ? undefined
          : scoreByGameId.get(row.canonicalGameId),
    });
  });
}

const newestFirst = [desc(wagers.createdAt), desc(wagers.id)] as const;

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
    .orderBy(...newestFirst);
  return attachSettled(rows);
}

/**
 * Every group member can see every wager placed in the group, so this
 * carries userId alongside the wager.
 */
export async function listWagersForGroup(
  groupId: string,
  limit: number,
): Promise<{ wager: Wager; userId: string }[]> {
  const rows = await getDatabase()
    .select()
    .from(wagers)
    .where(eq(wagers.groupId, groupId))
    .orderBy(...newestFirst)
    .limit(limit);
  const settled = await attachSettled(rows);
  return rows.map((row, index) => ({
    wager: settled[index]!,
    userId: row.userId,
  }));
}

/** Limit matches, not bets: every selected match retains all group picks. */
export async function listGroupMatchActivity(groupId: string, limit = 20) {
  const db = getDatabase();
  const recent = db
    .select({ canonicalGameId: wagers.canonicalGameId })
    .from(wagers)
    .where(eq(wagers.groupId, groupId))
    .groupBy(wagers.canonicalGameId)
    .orderBy(desc(sql`max(${wagers.createdAt})`), wagers.canonicalGameId)
    .limit(limit);
  const rows = await db
    .select()
    .from(wagers)
    .where(
      and(eq(wagers.groupId, groupId), inArray(wagers.canonicalGameId, recent)),
    )
    .orderBy(...newestFirst);
  if (!rows.length) return [];
  const [settled, summaries] = await Promise.all([
    attachSettled(rows),
    db
      .select({ canonicalId: games.canonicalId, summary: games.summary })
      .from(games)
      .where(
        inArray(games.canonicalId, [
          ...new Set(rows.map((row) => row.canonicalGameId)),
        ]),
      ),
  ]);
  return groupMatchActivity(
    rows.map((row, i) => ({ userId: row.userId, wager: settled[i]! })),
    new Map(
      summaries.flatMap((row) => {
        const parsed = gameSummarySchema.safeParse(row.summary);
        return parsed.success ? [[row.canonicalId, parsed.data] as const] : [];
      }),
    ),
  );
}

export type GroupWagerPick = {
  wager: Wager;
  userName: string | null;
  groupName: string;
};

/**
 * Other members' picks on this game, across every group the viewer belongs
 * to. The viewer's own wagers are excluded.
 */
export async function listGroupWagersForGame(
  userId: string,
  canonicalGameId: string,
): Promise<GroupWagerPick[]> {
  const rows = await getDatabase()
    .select({ wager: wagers, userName: user.name, groupName: groups.name })
    .from(wagers)
    .innerJoin(
      groupMembers,
      and(
        eq(groupMembers.groupId, wagers.groupId),
        eq(groupMembers.userId, userId),
      ),
    )
    .innerJoin(user, eq(user.id, wagers.userId))
    .innerJoin(groups, eq(groups.id, wagers.groupId))
    .where(
      and(
        eq(wagers.canonicalGameId, canonicalGameId),
        ne(wagers.userId, userId),
      ),
    )
    .orderBy(...newestFirst);
  const settled = await attachSettled(rows.map((row) => row.wager));
  return rows.map((row, index) => ({
    wager: settled[index]!,
    userName: row.userName,
    groupName: row.groupName,
  }));
}

export async function listWagers(userId: string, limit: number) {
  const rows = await getDatabase()
    .select()
    .from(wagers)
    .where(eq(wagers.userId, userId))
    .orderBy(...newestFirst)
    .limit(limit);
  return attachSettled(rows);
}

export type WagerHistoryFilter = {
  sport?: Sport;
  outcome?: WagerOutcome | "open" | "settled";
  since?: Date;
  scope?: "solo" | "group";
  limit: number;
  offset: number;
};

/**
 * Newest first. `limit + 1` rows so the next page needs no count query.
 * Settlement and the final score come from the same join.
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
  } else if (filter.outcome === "settled") {
    conditions.push(isNotNull(creditEntries.outcome));
  } else if (filter.outcome) {
    conditions.push(eq(creditEntries.outcome, filter.outcome));
  }
  if (filter.scope === "solo") conditions.push(isNull(wagers.groupId));
  else if (filter.scope === "group") conditions.push(isNotNull(wagers.groupId));

  const rows = await getDatabase()
    .select({
      wager: wagers,
      outcome: creditEntries.outcome,
      returned: creditEntries.amount,
      settledAt: creditEntries.createdAt,
      summary: games.summary,
    })
    .from(wagers)
    .leftJoin(
      creditEntries,
      and(
        eq(creditEntries.wagerId, wagers.id),
        eq(creditEntries.kind, "return"),
      ),
    )
    .leftJoin(games, eq(games.canonicalId, wagers.canonicalGameId))
    .where(and(...conditions))
    .orderBy(...newestFirst)
    .limit(filter.limit + 1)
    .offset(filter.offset);

  const hasMore = rows.length > filter.limit;
  const items = rows.slice(0, filter.limit).map((row) => {
    const result = row.summary
      ? gameSummarySchema.parse(row.summary).result
      : undefined;
    return rowToWager(
      row.wager,
      row.outcome && row.settledAt && row.returned != null
        ? {
            outcome: row.outcome,
            returned: row.returned,
            settledAt: toIso(row.settledAt),
            finalScore:
              row.outcome !== "void" && result
                ? { homeScore: result.homeScore, awayScore: result.awayScore }
                : undefined,
          }
        : undefined,
    );
  });
  return { items, hasMore };
}

const SPORT_LABELS: Record<Sport, string> = {
  soccer: "Soccer",
  baseball: "Baseball",
};

/** Settled counts grouped by sport and by market. Open wagers are excluded. */
export async function getRecordSlices(userId: string): Promise<RecordSlices> {
  const counts = {
    won: sql`count(*) filter (where ${creditEntries.outcome} = 'won')`.mapWith(
      toSafeInteger,
    ),
    lost: sql`count(*) filter (where ${creditEntries.outcome} = 'lost')`.mapWith(
      toSafeInteger,
    ),
    voided:
      sql`count(*) filter (where ${creditEntries.outcome} = 'void')`.mapWith(
        toSafeInteger,
      ),
  };
  const settled = and(
    eq(wagers.userId, userId),
    isNotNull(creditEntries.outcome),
  );
  const settlementJoin = and(
    eq(creditEntries.wagerId, wagers.id),
    eq(creditEntries.kind, "return"),
  );
  const db = getDatabase();
  const [bySportRows, byMarketRows] = await Promise.all([
    db
      .select({ key: wagers.sport, ...counts })
      .from(wagers)
      .leftJoin(creditEntries, settlementJoin)
      .where(settled)
      .groupBy(wagers.sport),
    db
      .select({ key: wagers.marketId, label: wagers.marketLabel, ...counts })
      .from(wagers)
      .leftJoin(creditEntries, settlementJoin)
      .where(settled)
      .groupBy(wagers.marketId, wagers.marketLabel),
  ]);

  return recordSlicesSchema.parse({
    bySport: bySportRows.map((row) => ({
      key: row.key,
      label: SPORT_LABELS[row.key],
      won: row.won,
      lost: row.lost,
      voided: row.voided,
    })),
    byMarket: byMarketRows.map((row) => ({
      key: row.key,
      label: row.label,
      won: row.won,
      lost: row.lost,
      voided: row.voided,
    })),
  });
}
