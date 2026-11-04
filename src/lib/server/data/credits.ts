import { eq, sql } from "drizzle-orm";
import { getDatabase } from "../db/client";
import { creditEntries } from "../db/schema";
import { openWagerCountQuery } from "./wagers-repository";

function toSafeInteger(value: unknown): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new RangeError(`Ledger aggregate out of range: ${String(value)}`);
  }
  return number;
}

const balanceProjection = {
  balance: sql`coalesce(sum(${creditEntries.amount}), 0)`.mapWith(
    toSafeInteger,
  ),
  won: sql<number>`coalesce(sum(case when ${creditEntries.outcome} = 'won' then 1 else 0 end), 0)`,
  lost: sql<number>`coalesce(sum(case when ${creditEntries.outcome} = 'lost' then 1 else 0 end), 0)`,
};

/** One batch: ledger aggregates and open-wager count for the account chip. */
export async function loadAccountChipMetrics(userId: string) {
  const db = getDatabase();
  const [ledgerRows, openRows] = await db.batch([
    db
      .select(balanceProjection)
      .from(creditEntries)
      .where(eq(creditEntries.userId, userId)),
    openWagerCountQuery(db, userId),
  ]);
  const ledger = ledgerRows[0];
  return {
    balance: ledger?.balance ?? 0,
    won: ledger?.won ?? 0,
    lost: ledger?.lost ?? 0,
    openCount: openRows[0]?.count ?? 0,
  };
}
