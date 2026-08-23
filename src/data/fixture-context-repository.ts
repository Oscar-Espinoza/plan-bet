import "server-only";

import { and, asc, eq, gt, lt, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  fixtureContext,
  gameSnapshots,
  games,
  providerCache,
} from "@/db/schema";
import { evidenceFactSchema, type EvidenceFact } from "@/lib/contracts";

export type CacheKey = {
  provider: string;
  kind: string;
  scope: string;
};

/**
 * Returns the payload only while it is still fresh. Expiry is read here rather
 * than stored as a status, the same rule `cache-policy.ts` applies to schedules
 * and snapshots — an expired row stays on disk as last-known-good, it just stops
 * satisfying reads.
 */
export async function readCache(key: CacheKey, now = new Date()) {
  const [row] = await getDatabase()
    .select({ payload: providerCache.payload })
    .from(providerCache)
    .where(
      and(
        eq(providerCache.provider, key.provider),
        eq(providerCache.kind, key.kind),
        eq(providerCache.scope, key.scope),
        gt(providerCache.expiresAt, now),
      ),
    )
    .limit(1);
  return row?.payload;
}

export async function writeCache(
  input: CacheKey & { payload: unknown; ttlMs: number },
  now = new Date(),
) {
  await getDatabase()
    .insert(providerCache)
    .values({
      provider: input.provider,
      kind: input.kind,
      scope: input.scope,
      payload: input.payload,
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + input.ttlMs),
    })
    .onConflictDoUpdate({
      target: [providerCache.provider, providerCache.kind, providerCache.scope],
      set: {
        payload: input.payload,
        fetchedAt: now,
        expiresAt: new Date(now.getTime() + input.ttlMs),
      },
    });
}

/**
 * The buddy asks by route id; context is stored per real game. This walks the
 * `game_snapshots.route_id → games.id` join so a Clásico read from either
 * team's route returns the one shared row.
 */
export async function readFixtureContext(routeId: string) {
  const [row] = await getDatabase()
    .select({ facts: fixtureContext.facts, summary: fixtureContext.summary })
    .from(fixtureContext)
    .innerJoin(gameSnapshots, eq(gameSnapshots.gameId, fixtureContext.gameId))
    .where(eq(gameSnapshots.routeId, routeId))
    .limit(1);
  if (!row) return undefined;

  // Stored facts are re-parsed rather than trusted: a row written by an earlier
  // build must never reach the prompt in a shape the contract no longer allows.
  const facts = evidenceFactSchema.array().safeParse(row.facts);
  if (!facts.success) return undefined;
  return { facts: facts.data, summary: row.summary };
}

export async function upsertFixtureContext(input: {
  gameId: string;
  facts: EvidenceFact[];
  summary: string;
  now?: Date;
}) {
  const builtAt = input.now ?? new Date();
  await getDatabase()
    .insert(fixtureContext)
    .values({
      gameId: input.gameId,
      facts: input.facts,
      summary: input.summary,
      builtAt,
    })
    .onConflictDoUpdate({
      target: fixtureContext.gameId,
      set: { facts: input.facts, summary: input.summary, builtAt },
    });
}

export type DueGame = {
  id: string;
  canonicalId: string;
  sport: "soccer" | "baseball";
  scheduledAt: Date;
  builtAt: Date | null;
};

/**
 * Upcoming games worth enriching, nearest kickoff first — the fixture a reader
 * is most likely to be looking at is the one worth spending a request on.
 * Derived from a left join against what has already been built rather than from
 * a queue table, so a postponed fixture needs no reconciliation.
 */
export async function dueWork(input: {
  now?: Date;
  horizonDays: number;
  limit: number;
  rebuildAfterMs: number;
}): Promise<DueGame[]> {
  const now = input.now ?? new Date();
  const horizon = new Date(now.getTime() + input.horizonDays * 86_400_000);
  const rebuildBefore = new Date(now.getTime() - input.rebuildAfterMs);

  return getDatabase()
    .select({
      id: games.id,
      canonicalId: games.canonicalId,
      sport: games.sport,
      scheduledAt: games.scheduledAt,
      builtAt: fixtureContext.builtAt,
    })
    .from(games)
    .leftJoin(fixtureContext, eq(fixtureContext.gameId, games.id))
    .where(
      and(
        gt(games.scheduledAt, now),
        lt(games.scheduledAt, horizon),
        sql`(${fixtureContext.builtAt} is null or ${fixtureContext.builtAt} < ${rebuildBefore})`,
      ),
    )
    .orderBy(asc(games.scheduledAt))
    .limit(input.limit);
}
