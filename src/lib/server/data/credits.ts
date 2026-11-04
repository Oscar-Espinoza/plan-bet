import { eq, getTableColumns, param, sql } from "drizzle-orm";
import { creditSummarySchema, type CreditSummary } from "../domain/contracts";
import { INT4_MAX } from "../../shared/markets";
import { getDatabase } from "../db/client";
import { creditEntries } from "../db/schema";
import { openWagerCountQuery } from "./wagers-repository";

export const STARTING_CREDITS = 1000;
const RESET_HOURLY_LIMIT = 5;
const RESET_WINDOW_MS = 60 * 60 * 1000;
const RESET_REASON = "manual_reset";

/**
 * The INSERT…SELECT lists every column in definition order. A new column
 * must be added to that statement in the same position.
 */
const CREDIT_ENTRY_COLUMNS = [
  "id",
  "userId",
  "kind",
  "amount",
  "reason",
  "wagerId",
  "outcome",
  "settlementRunId",
  "createdAt",
] as const;

function assertCreditColumnOrder() {
  const actual = Object.keys(getTableColumns(creditEntries));
  if (
    actual.length !== CREDIT_ENTRY_COLUMNS.length ||
    actual.some((key, index) => key !== CREDIT_ENTRY_COLUMNS[index])
  ) {
    throw new Error(
      `credit_entries column order changed: ${actual.join(", ")}`,
    );
  }
}

assertCreditColumnOrder();

function toSafeInteger(value: unknown): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new RangeError(`Ledger aggregate out of range: ${String(value)}`);
  }
  return number;
}

function changedRows(result: unknown): number {
  if (!result || typeof result !== "object" || !("meta" in result)) return 0;
  const meta = result.meta;
  if (!meta || typeof meta !== "object" || !("changes" in meta)) return 0;
  return typeof meta.changes === "number" ? meta.changes : 0;
}

// SQLite sums integers in 64-bit. mapWith still rejects a value that is not
// an exact JS integer, which is the same boundary the legacy bigint cast had.
export const SUMMARY_PROJECTION = {
  balance: sql`coalesce(sum(${creditEntries.amount}), 0)`.mapWith(
    toSafeInteger,
  ),
  lifetimeStaked:
    sql`coalesce(-sum(${creditEntries.amount}) filter (where ${creditEntries.kind} = 'stake'), 0)`.mapWith(
      toSafeInteger,
    ),
  lifetimeReturned:
    sql`coalesce(sum(${creditEntries.amount}) filter (where ${creditEntries.kind} = 'return'), 0)`.mapWith(
      toSafeInteger,
    ),
  resetCount:
    sql`coalesce(count(*) filter (where ${creditEntries.kind} = 'reset'), 0)`.mapWith(
      toSafeInteger,
    ),
  won: sql`coalesce(count(*) filter (where ${creditEntries.outcome} = 'won'), 0)`.mapWith(
    toSafeInteger,
  ),
  lost: sql`coalesce(count(*) filter (where ${creditEntries.outcome} = 'lost'), 0)`.mapWith(
    toSafeInteger,
  ),
  voided:
    sql`coalesce(count(*) filter (where ${creditEntries.outcome} = 'void'), 0)`.mapWith(
      toSafeInteger,
    ),
};

const balanceProjection = {
  balance: SUMMARY_PROJECTION.balance,
  won: SUMMARY_PROJECTION.won,
  lost: SUMMARY_PROJECTION.lost,
};

export function toSummary(row?: {
  balance: number;
  lifetimeStaked: number;
  lifetimeReturned: number;
  resetCount: number;
  won?: number;
  lost?: number;
  voided?: number;
}): CreditSummary {
  const balance = row?.balance ?? 0;
  const lifetimeStaked = row?.lifetimeStaked ?? 0;
  const lifetimeReturned = row?.lifetimeReturned ?? 0;
  return creditSummarySchema.parse({
    balance,
    lifetimeStaked,
    lifetimeReturned,
    net: lifetimeReturned - lifetimeStaked,
    resetCount: row?.resetCount ?? 0,
    won: row?.won ?? 0,
    lost: row?.lost ?? 0,
    voided: row?.voided ?? 0,
  });
}

/** Ledger aggregates for one user. An account with no rows is all zeros. */
export async function getCreditSummary(userId: string): Promise<CreditSummary> {
  const [row] = await getDatabase()
    .select(SUMMARY_PROJECTION)
    .from(creditEntries)
    .where(eq(creditEntries.userId, userId));
  return toSummary(row);
}

/**
 * Current ledger sum. A placement does not use this to decide the write is
 * safe. After the batch inserts nothing, placeWager reads it only to choose
 * between insufficient_balance and another reason.
 */
export async function readBalance(userId: string): Promise<number> {
  const [row] = await getDatabase()
    .select({ balance: SUMMARY_PROJECTION.balance })
    .from(creditEntries)
    .where(eq(creditEntries.userId, userId));
  return row?.balance ?? 0;
}

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

/**
 * One conditional insert, then the summary, in one batch. Zero changed rows
 * means the hourly cap already held. A reset at delta 0 still inserts.
 */
export async function resetBankroll(input: {
  userId: string;
  now?: Date;
}): Promise<
  { ok: true; summary: CreditSummary } | { ok: false; reason: "rate_limited" }
> {
  const now = input.now ?? new Date();
  const windowStart = new Date(now.getTime() - RESET_WINDOW_MS);
  const db = getDatabase();
  const entryId = crypto.randomUUID();
  const [inserted, summaryRows] = await db.batch([
    db.insert(creditEntries).select(sql`
      select
        ${entryId},
        ${input.userId},
        'reset',
        max(
          ${-INT4_MAX},
          min(
            ${INT4_MAX},
            ${STARTING_CREDITS} - (
              select coalesce(sum(${creditEntries.amount}), 0)
              from ${creditEntries}
              where ${creditEntries.userId} = ${input.userId}
            )
          )
        ),
        ${RESET_REASON},
        null,
        null,
        null,
        ${param(now, creditEntries.createdAt)}
      where (
        select count(*)
        from ${creditEntries}
        where ${creditEntries.userId} = ${input.userId}
          and ${creditEntries.kind} = 'reset'
          and ${creditEntries.createdAt} >= ${param(windowStart, creditEntries.createdAt)}
      ) < ${RESET_HOURLY_LIMIT}
    `),
    db
      .select(SUMMARY_PROJECTION)
      .from(creditEntries)
      .where(eq(creditEntries.userId, input.userId)),
  ]);
  if (changedRows(inserted) === 0) {
    return { ok: false, reason: "rate_limited" };
  }
  return { ok: true, summary: toSummary(summaryRows[0]) };
}
