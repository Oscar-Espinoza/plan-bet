import "server-only";

import { cache } from "react";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDatabase, withDatabaseTransaction } from "@/db/client";
import { creditEntries } from "@/db/schema";
import { creditSummarySchema, type CreditSummary } from "@/lib/contracts";
import { INT4_MAX } from "@/lib/markets";

export const STARTING_CREDITS = 1000;
const RESET_HOURLY_LIMIT = 5;

type Transaction = Parameters<Parameters<typeof withDatabaseTransaction>[0]>[0];

/**
 * Money sums are bigint in SQL: each entry fits an int4 column, but a
 * balance or a lifetime total built from many of them need not, and an int4
 * cast would fail the whole query (/you, placement, reset). The driver hands
 * int8 back as a string; it becomes a number here, and only if it is exact.
 */
function toSafeInteger(value: unknown): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new RangeError(`Ledger aggregate out of range: ${String(value)}`);
  }
  return number;
}

// Exported so src/data/wagers.ts can read the same aggregate inside its own
// advisory-locked transaction rather than duplicating the projection.
// won/lost/voided count `return` rows by their `outcome` column (Session
// 09) — filters, not a join, since the outcome lives on this same table.
// Counts stay int4: they count rows, not credits.
export const SUMMARY_PROJECTION = {
  balance: sql`coalesce(sum(${creditEntries.amount}), 0)::bigint`.mapWith(
    toSafeInteger,
  ),
  lifetimeStaked:
    sql`coalesce(-sum(${creditEntries.amount}) filter (where ${creditEntries.kind} = 'stake'), 0)::bigint`.mapWith(
      toSafeInteger,
    ),
  lifetimeReturned:
    sql`coalesce(sum(${creditEntries.amount}) filter (where ${creditEntries.kind} = 'return'), 0)::bigint`.mapWith(
      toSafeInteger,
    ),
  resetCount: sql<number>`coalesce(count(*) filter (where ${creditEntries.kind} = 'reset'), 0)::int`,
  won: sql<number>`coalesce(count(*) filter (where ${creditEntries.outcome} = 'won'), 0)::int`,
  lost: sql<number>`coalesce(count(*) filter (where ${creditEntries.outcome} = 'lost'), 0)::int`,
  voided: sql<number>`coalesce(count(*) filter (where ${creditEntries.outcome} = 'void'), 0)::int`,
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
  // Parsed at the data-layer boundary, so the route, /you, and the topbar
  // control all inherit it rather than each re-validating.
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

/**
 * All five figures are aggregates over the append-only ledger — never a
 * stored column. An account with no rows reads 0 across the board, never
 * `null`.
 *
 * React.cache()'d: /you and /games/[id] each read this once for the page and
 * once more for the topbar chip. Per-request dedupe only.
 */
export const getCreditSummary = cache(async function getCreditSummary(
  userId: string,
): Promise<CreditSummary> {
  const [row] = await getDatabase()
    .select(SUMMARY_PROJECTION)
    .from(creditEntries)
    .where(eq(creditEntries.userId, userId));
  return toSummary(row);
});

/**
 * The one per-account balance lock (classid 4). Every transaction that reads
 * the balance to decide a debit or a reset takes it first — placement and
 * reset both — so neither can act on a balance the other is about to change.
 * Settlement only ever credits, so it does not need it. Classid 3 (the old,
 * separate reset lock) is free.
 */
export async function lockAccountBalance(
  transaction: Transaction,
  userId: string,
) {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(4, hashtext(${userId}))`,
  );
}

/** Call only after lockAccountBalance, inside the same transaction. */
export async function readLockedBalance(
  transaction: Transaction,
  userId: string,
): Promise<number> {
  const [row] = await transaction
    .select({ balance: SUMMARY_PROJECTION.balance })
    .from(creditEntries)
    .where(eq(creditEntries.userId, userId));
  return row?.balance ?? 0;
}

/**
 * ponytail: advisory lock + count over credit_entries, same shape as
 * claimBriefingSlot. Move to a counter table only if reset volume ever
 * matters. Shares the balance lock with placement, which also serialises the
 * hourly count.
 */
export async function resetBankroll(input: {
  userId: string;
  now?: Date;
}): Promise<
  { ok: true; summary: CreditSummary } | { ok: false; reason: "rate_limited" }
> {
  const now = input.now ?? new Date();
  const windowStart = new Date(now.getTime() - 60 * 60 * 1000);

  return withDatabaseTransaction(async (transaction) => {
    await lockAccountBalance(transaction, input.userId);

    const [resetCount] = await transaction
      .select({ used: sql<number>`count(*)::int` })
      .from(creditEntries)
      .where(
        and(
          eq(creditEntries.userId, input.userId),
          eq(creditEntries.kind, "reset"),
          gte(creditEntries.createdAt, windowStart),
        ),
      );
    if ((resetCount?.used ?? 0) >= RESET_HOURLY_LIMIT) {
      return { ok: false, reason: "rate_limited" } as const;
    }

    const balance = await readLockedBalance(transaction, input.userId);

    // Inserted even when the delta is 0, so resetCount always advances and
    // nothing is ever deleted. `amount` is int4 but a balance is not: a
    // balance more than INT4_MAX above the starting credits is lowered by
    // INT4_MAX per reset rather than failing the insert.
    await transaction.insert(creditEntries).values({
      userId: input.userId,
      kind: "reset",
      amount: Math.min(
        INT4_MAX,
        Math.max(-INT4_MAX, STARTING_CREDITS - balance),
      ),
      reason: "manual_reset",
    });

    const [summaryRow] = await transaction
      .select(SUMMARY_PROJECTION)
      .from(creditEntries)
      .where(eq(creditEntries.userId, input.userId));

    return { ok: true, summary: toSummary(summaryRow) } as const;
  });
}
