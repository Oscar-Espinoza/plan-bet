import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { applyScheduleMode, applySnapshotMode } from "../domain/cache-policy";
import {
  gameScheduleSchema,
  gameSnapshotSchema,
  gameSummarySchema,
  type GameResult,
  type GameSchedule,
  type GameSnapshot,
  type GameStatus,
  type TeamSlug,
} from "../domain/contracts";
import { stableHash } from "../domain/stable-hash";
import { getDatabase, runBatch } from "../db/client";
import {
  buddyMessages,
  gameSnapshots,
  games,
  ingestionRuns,
  teamGames,
  teams,
} from "../db/schema";

const LEASE_TIMEOUT_MS = 2 * 60 * 1000;
const METADATA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ProviderSnapshot = {
  providerGameId: string;
  canonicalGameId: string;
  route: {
    id: string;
    teamSlug: TeamSlug;
  };
  snapshot: GameSnapshot;
};

export type CanonicalTeamBundle = {
  provider: string;
  providerExternalId: string;
  metadataRefreshed: boolean;
  metadataObservedAt: Date;
  schedule: GameSchedule;
  snapshots: ProviderSnapshot[];
};

export type ProviderGameUpdate = {
  canonicalGameId: string;
  status: GameStatus;
  scheduledAt: string;
  startTimeTbd?: boolean;
  scheduledDate?: string;
  result?: GameResult;
};

function changedRows(result: unknown) {
  if (!result || typeof result !== "object" || !("meta" in result)) return 0;
  const meta = result.meta;
  if (!meta || typeof meta !== "object" || !("changes" in meta)) return 0;
  return typeof meta.changes === "number" ? meta.changes : 0;
}

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
  const id = crypto.randomUUID();
  const database = getDatabase();
  const staleBefore = new Date(now.getTime() - LEASE_TIMEOUT_MS);
  const [, inserted] = await runBatch([
    database
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
          lt(ingestionRuns.startedAt, staleBefore),
        ),
      ),
    database
      .insert(ingestionRuns)
      .values({
        id,
        provider: input.provider,
        operation: input.operation,
        scope: input.scope,
        status: "running",
        requestId: input.requestId,
        startedAt: now,
      })
      .onConflictDoNothing(),
  ]);
  if (changedRows(inserted) !== 1) return undefined;
  return { id, startedAt: now };
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
  const schedule = input.bundle.schedule;
  const slug = schedule.team.slug;
  for (const item of input.bundle.snapshots) {
    if (item.route.id !== item.snapshot.game.id) {
      throw new Error("Snapshot route ownership does not match its game ID");
    }
    if (item.route.teamSlug !== slug) {
      throw new Error("Snapshot route is owned by a different team");
    }
  }

  const metadataExpiry = new Date(input.fetchedAt.getTime() + METADATA_TTL_MS);
  const scheduleExpiry = new Date(schedule.freshness.expiresAt!);
  const teamValues = {
    slug,
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
        sport: teamValues.sport,
        provider: teamValues.provider,
        externalId: teamValues.externalId,
        canonical: teamValues.canonical,
        schedule: teamValues.schedule,
        scheduleFetchedAt: teamValues.scheduleFetchedAt,
        scheduleExpiresAt: teamValues.scheduleExpiresAt,
        schedulePayloadHash: teamValues.schedulePayloadHash,
        updatedAt: teamValues.updatedAt,
      };

  const database = getDatabase();
  const statements: BatchItem<"sqlite">[] = [
    database
      .insert(teams)
      .values(teamValues)
      .onConflictDoUpdate({ target: teams.slug, set: metadataSet }),
  ];

  for (const item of input.bundle.snapshots) {
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
    const teamId = sql`(select ${teams.id} from ${teams} where ${teams.slug} = ${slug})`;
    const gameId = sql`(select ${games.id} from ${games} where ${games.canonicalId} = ${item.canonicalGameId})`;
    statements.push(
      database
        .insert(games)
        .values(gameValues)
        .onConflictDoUpdate({ target: games.canonicalId, set: gameValues }),
      database
        .insert(teamGames)
        .select(
          database
            .select({ teamId: teams.id, gameId: games.id })
            .from(teams)
            .innerJoin(games, eq(games.canonicalId, item.canonicalGameId))
            .where(eq(teams.slug, slug)),
        )
        .onConflictDoNothing(),
      database
        .insert(gameSnapshots)
        .values({
          routeId: item.route.id,
          gameId,
          teamId,
          snapshot: item.snapshot,
          sourceObservedAt: new Date(item.snapshot.freshness.sourceObservedAt),
          fetchedAt: input.fetchedAt,
          expiresAt: new Date(item.snapshot.freshness.expiresAt!),
          payloadHash: stableHash(item.snapshot),
          updatedAt: input.fetchedAt,
        })
        .onConflictDoUpdate({
          target: gameSnapshots.routeId,
          set: {
            gameId: sql`excluded.game_id`,
            teamId: sql`excluded.team_id`,
            snapshot: sql`excluded.snapshot`,
            sourceObservedAt: sql`excluded.source_observed_at`,
            fetchedAt: sql`excluded.fetched_at`,
            expiresAt: sql`excluded.expires_at`,
            payloadHash: sql`excluded.payload_hash`,
            updatedAt: sql`excluded.updated_at`,
          },
        }),
    );
  }

  await runBatch(statements);
}

/**
 * Applies by-id status updates to games already stored. Only `games.summary`
 * changes: status, kickoff and result are replaced together. The current
 * summary is read first because the merge keeps every other contract field
 * and is re-parsed before the write. A game this provider never stored is
 * ignored. Returns the rows updated.
 */
export async function applyGameUpdates(input: {
  provider: string;
  updates: ProviderGameUpdate[];
  fetchedAt: Date;
}) {
  if (!input.updates.length) return 0;
  const database = getDatabase();
  const rows = await database
    .select({ canonicalId: games.canonicalId, summary: games.summary })
    .from(games)
    .where(
      and(
        eq(games.provider, input.provider),
        inArray(
          games.canonicalId,
          input.updates.map((update) => update.canonicalGameId),
        ),
      ),
    );
  const stored = new Map(rows.map((row) => [row.canonicalId, row.summary]));
  let updated = 0;
  for (const update of input.updates) {
    const current = stored.get(update.canonicalGameId);
    if (!current) continue;
    const summary = gameSummarySchema.parse({
      ...current,
      status: update.status,
      scheduledAt: update.scheduledAt,
      startTimeTbd: update.startTimeTbd,
      scheduledDate: update.scheduledDate,
      result: update.result,
    });
    await database
      .update(games)
      .set({
        summary,
        scheduledAt: new Date(summary.scheduledAt),
        fetchedAt: input.fetchedAt,
        payloadHash: stableHash(summary),
        updatedAt: input.fetchedAt,
      })
      .where(eq(games.canonicalId, update.canonicalGameId));
    updated += 1;
  }
  return updated;
}

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

export async function getLastAiGenerationAt() {
  const [row] = await getDatabase()
    .select({
      lastGenerationAt: sql<number | null>`max(${buddyMessages.createdAt})`,
    })
    .from(buddyMessages);
  if (row?.lastGenerationAt == null) return undefined;
  return new Date(row.lastGenerationAt);
}
