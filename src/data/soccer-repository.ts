import "server-only";

import { and, asc, desc, eq, lt } from "drizzle-orm";
import { applyScheduleMode, applySnapshotMode } from "@/data/cache-policy";
import { getDatabase, withDatabaseTransaction } from "@/db/client";
import {
  gameSnapshots,
  games,
  ingestionRuns,
  teamGames,
  teams,
} from "@/db/schema";
import { gameScheduleSchema, gameSnapshotSchema } from "@/lib/contracts";
import type { NormalizedSoccerTeamData } from "@/providers/football-data/normalize";
import { stableHash } from "@/providers/football-data/normalize";

const LEASE_TIMEOUT_MS = 2 * 60 * 1000;

export async function getStoredTeamMetadata(slug: "real-madrid" | "barcelona") {
  const [row] = await getDatabase()
    .select()
    .from(teams)
    .where(eq(teams.slug, slug))
    .limit(1);
  return row;
}

export async function readStoredSchedule(
  slug: "real-madrid" | "barcelona",
  now = new Date(),
) {
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

export async function acquireRefreshLease(requestId: string, now = new Date()) {
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
        eq(ingestionRuns.provider, "football-data"),
        eq(ingestionRuns.operation, "refresh_soccer"),
        eq(ingestionRuns.scope, "configured-teams"),
        eq(ingestionRuns.status, "running"),
        lt(ingestionRuns.startedAt, new Date(now.getTime() - LEASE_TIMEOUT_MS)),
      ),
    );

  const [lease] = await database
    .insert(ingestionRuns)
    .values({
      provider: "football-data",
      operation: "refresh_soccer",
      scope: "configured-teams",
      status: "running",
      requestId,
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

export async function persistSoccerTeamData(input: {
  data: NormalizedSoccerTeamData;
  providerExternalId: string;
  metadataRefreshed: boolean;
  metadataObservedAt: Date;
  fetchedAt: Date;
}) {
  await withDatabaseTransaction(async (transaction) => {
    const existing = await transaction
      .select()
      .from(teams)
      .where(eq(teams.slug, input.data.schedule.team.slug))
      .limit(1);
    const metadataExpiry = new Date(
      input.fetchedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
    );
    const schedule = input.data.schedule;
    const scheduleExpiry = new Date(schedule.freshness.expiresAt!);
    const teamValues = {
      slug: schedule.team.slug,
      sport: schedule.team.sport,
      provider: "football-data",
      externalId: input.providerExternalId,
      canonical: schedule.team,
      schedule,
      scheduleFetchedAt: input.fetchedAt,
      scheduleExpiresAt: scheduleExpiry,
      schedulePayloadHash: stableHash(schedule),
      sourceObservedAt: input.metadataObservedAt,
      fetchedAt: input.fetchedAt,
      expiresAt: metadataExpiry,
      payloadHash: stableHash(schedule.team),
      updatedAt: input.fetchedAt,
    };
    const metadataSet = input.metadataRefreshed
      ? teamValues
      : {
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

    for (const snapshot of input.data.snapshots) {
      const game = snapshot.game;
      const externalId = game.id.split("-")[2];
      if (!externalId) throw new Error(`Invalid provider game ID ${game.id}`);
      const gameValues = {
        canonicalId: `football-data-${externalId}`,
        sport: game.sport,
        provider: "football-data",
        externalId,
        summary: game,
        scheduledAt: new Date(game.scheduledAt),
        sourceObservedAt: new Date(snapshot.freshness.sourceObservedAt),
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
        routeId: snapshot.game.id,
        gameId: gameRow.id,
        teamId,
        snapshot,
        sourceObservedAt: new Date(snapshot.freshness.sourceObservedAt),
        fetchedAt: input.fetchedAt,
        expiresAt: new Date(snapshot.freshness.expiresAt!),
        payloadHash: stableHash(snapshot),
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

export async function getRecentProviderState() {
  const [run] = await getDatabase()
    .select()
    .from(ingestionRuns)
    .where(eq(ingestionRuns.provider, "football-data"))
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(1);
  return run;
}

export async function listStoredSoccerGames() {
  return getDatabase()
    .select({ routeId: gameSnapshots.routeId, scheduledAt: games.scheduledAt })
    .from(gameSnapshots)
    .innerJoin(games, eq(gameSnapshots.gameId, games.id))
    .orderBy(asc(games.scheduledAt));
}
