import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { getDatabase, withDatabaseTransaction } from "@/db/client";
import { creditEntries } from "@/db/schema";
import { creditSummarySchema, type CreditSummary } from "@/lib/contracts";

export const STARTING_CREDITS = 1000;
const RESET_HOURLY_LIMIT = 5;

const SUMMARY_PROJECTION = {
  balance: sql<number>`coalesce(sum(${creditEntries.amount}), 0)::int`,
  lifetimeStaked: sql<number>`coalesce(-sum(${creditEntries.amount}) filter (where ${creditEntries.kind} = 'stake'), 0)::int`,
  lifetimeReturned: sql<number>`coalesce(sum(${creditEntries.amount}) filter (where ${creditEntries.kind} = 'return'), 0)::int`,
  resetCount: sql<number>`coalesce(count(*) filter (where ${creditEntries.kind} = 'reset'), 0)::int`,
};

function toSummary(row?: {
  balance: number;
  lifetimeStaked: number;
  lifetimeReturned: number;
  resetCount: number;
}): CreditSummary {
  const balance = row?.balance ?? 0;
  const lifetimeStaked = row?.lifetimeStaked ?? 0;
  const lifetimeReturned = row?.lifetimeReturned ?? 0;
  // Parsed at the data-layer boundary, so the route, /account, and the topbar
  // control all inherit it rather than each re-validating.
  return creditSummarySchema.parse({
    balance,
    lifetimeStaked,
    lifetimeReturned,
    net: lifetimeReturned - lifetimeStaked,
    resetCount: row?.resetCount ?? 0,
  });
}

/**
 * All five figures are aggregates over the append-only ledger — never a
 * stored column. An account with no rows reads 0 across the board, never
 * `null`.
 */
export async function getCreditSummary(userId: string): Promise<CreditSummary> {
  const [row] = await getDatabase()
    .select(SUMMARY_PROJECTION)
    .from(creditEntries)
    .where(eq(creditEntries.userId, userId));
  return toSummary(row);
}

/**
 * ponytail: advisory lock + count over credit_entries, same shape as
 * claimBriefingSlot. Move to a counter table only if reset volume ever
 * matters. classid 3 — 1 and 2 are the briefing session/IP quota locks.
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
    await transaction.execute(
      sql`select pg_advisory_xact_lock(3, hashtext(${input.userId}))`,
    );

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

    const [balanceRow] = await transaction
      .select({
        balance: sql<number>`coalesce(sum(${creditEntries.amount}), 0)::int`,
      })
      .from(creditEntries)
      .where(eq(creditEntries.userId, input.userId));
    const balance = balanceRow?.balance ?? 0;

    // Inserted even when the delta is 0, so resetCount always advances and
    // nothing is ever deleted.
    await transaction.insert(creditEntries).values({
      userId: input.userId,
      kind: "reset",
      amount: STARTING_CREDITS - balance,
      reason: "manual_reset",
    });

    const [summaryRow] = await transaction
      .select(SUMMARY_PROJECTION)
      .from(creditEntries)
      .where(eq(creditEntries.userId, input.userId));

    return { ok: true, summary: toSummary(summaryRow) } as const;
  });
}
