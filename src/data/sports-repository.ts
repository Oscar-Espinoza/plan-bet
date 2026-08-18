import "server-only";

import { and, asc, desc, eq, lt } from "drizzle-orm";
import { applyScheduleMode, applySnapshotMode } from "@/data/cache-policy";
import { stableHash } from "@/data/stable-hash";
import { getDatabase, withDatabaseTransaction } from "@/db/client";
import {
  gameSnapshots,
  games,
  ingestionRuns,
  teamGames,
  teams,
} from "@/db/schema";
import {
  gameScheduleSchema,
  gameSnapshotSchema,
  type TeamSlug,
} from "@/lib/contracts";
import type { CanonicalTeamBundle } from "@/providers/contracts";

const LEASE_TIMEOUT_MS = 2 * 60 * 1000;
const METADATA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function getStoredTeamMetadata(slug: TeamSlug) {
  const [row] = await getDatabase()
    .select()
    .from(teams)
    .where(eq(teams.slug, slug))
    .limit(1);
  return row;
}

export async function readStoredSchedule(slug: TeamSlug, now = new Date()) {
  const [row] = await getDatabase()
    .select({ schedule: teams.schedule })
    .from(teams)
    .where(eq(teams.slug, slug))
    .limit(1);
  if (!row?.schedule) return undefined;
  return applyScheduleMode(gameScheduleSchema.parse(row.schedule), now);
}

export async function readStoredSnapshot(routeId: string, now = new Date()) {
  const [row] = await getDatabase()
    .select({ snapshot: gameSnapshots.snapshot })
    .from(gameSnapshots)
    .where(eq(gameSnapshots.routeId, routeId))
    .limit(1);
  if (!row) return undefined;
  return applySnapshotMode(gameSnapshotSchema.parse(row.snapshot), now);
}

export async function acquireRefreshLease(input: {
  provider: string;
  operation: string;
  scope: string;
  requestId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const database = getDatabase();
  await database
    .update(ingestionRuns)
    .set({
      status: "failed",
      completedAt: now,
      errorCode: "lease_expired",
      errorMessage: "Previous refresh lease expired",
    })
    .where(
      and(
        eq(ingestionRuns.provider, input.provider),
        eq(ingestionRuns.operation, input.operation),
        eq(ingestionRuns.scope, input.scope),
        eq(ingestionRuns.status, "running"),
        lt(ingestionRuns.startedAt, new Date(now.getTime() - LEASE_TIMEOUT_MS)),
      ),
    );

  const [lease] = await database
    .insert(ingestionRuns)
    .values({
      provider: input.provider,
      operation: input.operation,
      scope: input.scope,
      status: "running",
      requestId: input.requestId,
      startedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: ingestionRuns.id, startedAt: ingestionRuns.startedAt });
  return lease;
}

export async function completeRefreshLease(input: {
  id: string;
  startedAt: Date;
  status: "succeeded" | "failed";
  cacheResult?: "refreshed" | "stale" | "demo";
  errorCode?: string;
  errorMessage?: string;
}) {
  const completedAt = new Date();
  await getDatabase()
    .update(ingestionRuns)
    .set({
      status: input.status,
      cacheResult: input.cacheResult,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage?.slice(0, 240),
      completedAt,
      durationMs: Math.max(
        0,
        completedAt.getTime() - input.startedAt.getTime(),
      ),
    })
    .where(eq(ingestionRuns.id, input.id));
}

export async function recordProviderDiagnostic(input: {
  provider: string;
  operation: string;
  scope: string;
  requestId: string;
  status: "succeeded" | "failed";
  errorCode?: string;
  errorMessage?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await getDatabase()
    .insert(ingestionRuns)
    .values({
      provider: input.provider,
      operation: input.operation,
      scope: input.scope,
      status: input.status,
      requestId: input.requestId,
      startedAt: now,
      completedAt: now,
      durationMs: 0,
      cacheResult: input.status === "succeeded" ? "refreshed" : "stale",
      errorCode: input.errorCode,
      errorMessage: input.errorMessage?.slice(0, 240),
    });
}

export async function persistSportsTeamData(input: {
  bundle: CanonicalTeamBundle;
  fetchedAt: Date;
}) {
  await withDatabaseTransaction(async (transaction) => {
    const schedule = input.bundle.schedule;
    const existing = await transaction
      .select()
      .from(teams)
      .where(eq(teams.slug, schedule.team.slug))
      .limit(1);
    const metadataExpiry = new Date(
      input.fetchedAt.getTime() + METADATA_TTL_MS,
    );
    const scheduleExpiry = new Date(schedule.freshness.expiresAt!);
    const teamValues = {
      slug: schedule.team.slug,
      sport: schedule.team.sport,
      provider: input.bundle.provider,
      externalId: input.bundle.providerExternalId,
      canonical: schedule.team,
      schedule,
      scheduleFetchedAt: input.fetchedAt,
      scheduleExpiresAt: scheduleExpiry,
      schedulePayloadHash: stableHash(schedule),
      sourceObservedAt: input.bundle.metadataObservedAt,
      fetchedAt: input.fetchedAt,
      expiresAt: metadataExpiry,
      payloadHash: stableHash(schedule.team),
      updatedAt: input.fetchedAt,
    };
    const metadataSet = input.bundle.metadataRefreshed
      ? teamValues
      : {
          sport: schedule.team.sport,
          provider: input.bundle.provider,
          externalId: input.bundle.providerExternalId,
          canonical: schedule.team,
          schedule,
          scheduleFetchedAt: input.fetchedAt,
          scheduleExpiresAt: scheduleExpiry,
          schedulePayloadHash: stableHash(schedule),
          updatedAt: input.fetchedAt,
        };
    const [teamRow] = await transaction
      .insert(teams)
      .values(teamValues)
      .onConflictDoUpdate({ target: teams.slug, set: metadataSet })
      .returning({ id: teams.id });
    const teamId = teamRow?.id ?? existing[0]?.id;
    if (!teamId) throw new Error("Unable to resolve persisted team");

    for (const item of input.bundle.snapshots) {
      if (item.route.id !== item.snapshot.game.id) {
        throw new Error("Snapshot route ownership does not match its game ID");
      }
      if (item.route.teamSlug !== schedule.team.slug) {
        throw new Error("Snapshot route is owned by a different team");
      }
      const game = item.snapshot.game;
      const gameValues = {
        canonicalId: item.canonicalGameId,
        sport: game.sport,
        provider: input.bundle.provider,
        externalId: item.providerGameId,
        summary: game,
        scheduledAt: new Date(game.scheduledAt),
        sourceObservedAt: new Date(item.snapshot.freshness.sourceObservedAt),
        fetchedAt: input.fetchedAt,
        expiresAt: scheduleExpiry,
        payloadHash: stableHash(game),
        updatedAt: input.fetchedAt,
      };
      const [gameRow] = await transaction
        .insert(games)
        .values(gameValues)
        .onConflictDoUpdate({
          target: games.canonicalId,
          set: gameValues,
        })
        .returning({ id: games.id });
      if (!gameRow) throw new Error("Unable to resolve persisted game");
      await transaction
        .insert(teamGames)
        .values({ teamId, gameId: gameRow.id })
        .onConflictDoNothing();
      const snapshotValues = {
        routeId: item.route.id,
        gameId: gameRow.id,
        teamId,
        snapshot: item.snapshot,
        sourceObservedAt: new Date(item.snapshot.freshness.sourceObservedAt),
        fetchedAt: input.fetchedAt,
        expiresAt: new Date(item.snapshot.freshness.expiresAt!),
        payloadHash: stableHash(item.snapshot),
        updatedAt: input.fetchedAt,
      };
      await transaction
        .insert(gameSnapshots)
        .values(snapshotValues)
        .onConflictDoUpdate({
          target: gameSnapshots.routeId,
          set: snapshotValues,
        });
    }
  });
}

export async function getRecentProviderState(provider: string) {
  const [run] = await getDatabase()
    .select()
    .from(ingestionRuns)
    .where(eq(ingestionRuns.provider, provider))
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(1);
  return run;
}

export async function listStoredGames(sport?: "soccer" | "baseball") {
  const base = getDatabase()
    .select({ routeId: gameSnapshots.routeId, scheduledAt: games.scheduledAt })
    .from(gameSnapshots)
    .innerJoin(games, eq(gameSnapshots.gameId, games.id));
  if (sport) {
    return base.where(eq(games.sport, sport)).orderBy(asc(games.scheduledAt));
  }
  return base.orderBy(asc(games.scheduledAt));
}
