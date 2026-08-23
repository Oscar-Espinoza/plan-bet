import "server-only";

import { and, desc, eq, lt, sql } from "drizzle-orm";
import { applyScheduleMode, applySnapshotMode } from "@/data/cache-policy";
import { stableHash } from "@/data/stable-hash";
import { getDatabase, withDatabaseTransaction } from "@/db/client";
import {
  briefingRuns,
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

/**
 * The latest ingestion run for a provider, plus its latest *succeeded* run,
 * in two cheap indexed lookups (`ingestion_runs_recent_idx` on
 * provider+started_at) rather than one query per health field.
 */
export async function getProviderHealthState(provider: string) {
  const database = getDatabase();
  const [latest] = await database
    .select({
      status: ingestionRuns.status,
      startedAt: ingestionRuns.startedAt,
      durationMs: ingestionRuns.durationMs,
      errorCode: ingestionRuns.errorCode,
    })
    .from(ingestionRuns)
    .where(eq(ingestionRuns.provider, provider))
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(1);
  const [succeeded] = await database
    .select({ startedAt: ingestionRuns.startedAt })
    .from(ingestionRuns)
    .where(
      and(
        eq(ingestionRuns.provider, provider),
        eq(ingestionRuns.status, "succeeded"),
      ),
    )
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(1);
  return {
    lastRunAt: latest?.startedAt,
    lastStatus: latest?.status,
    lastErrorCode: latest?.errorCode ?? undefined,
    lastDurationMs: latest?.durationMs ?? undefined,
    lastSuccessAt: succeeded?.startedAt,
  };
}

/**
 * Nothing ever writes an `ingestion_runs` row with provider "openai" — its
 * recency signal is the most recent briefing generation attempt instead.
 * Aggregate-only, no session/ip/input/output columns touched.
 */
export async function getLastBriefingGenerationAt() {
  const [row] = await getDatabase()
    .select({
      lastGenerationAt: sql<string | null>`max(${briefingRuns.startedAt})`,
    })
    .from(briefingRuns);
  return row?.lastGenerationAt ? new Date(row.lastGenerationAt) : undefined;
}
