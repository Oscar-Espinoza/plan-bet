import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  Briefing,
  GameSchedule,
  GameSnapshot,
  GameSummary,
  Team,
} from "@/lib/contracts";

export const sportEnum = pgEnum("sport", ["soccer", "baseball"]);
export const ingestionStatusEnum = pgEnum("ingestion_status", [
  "running",
  "succeeded",
  "failed",
]);
export const briefingStatusEnum = pgEnum("briefing_status", [
  "running",
  "succeeded",
  "failed",
]);
export const briefingModeEnum = pgEnum("briefing_mode", ["live", "fallback"]);
export const cacheResultEnum = pgEnum("cache_result", [
  "hit",
  "miss",
  "refreshed",
  "stale",
  "demo",
]);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    sport: sportEnum("sport").notNull(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    canonical: jsonb("canonical").$type<Team>().notNull(),
    schedule: jsonb("schedule").$type<GameSchedule>(),
    scheduleFetchedAt: timestamp("schedule_fetched_at", {
      withTimezone: true,
    }),
    scheduleExpiresAt: timestamp("schedule_expires_at", {
      withTimezone: true,
    }),
    schedulePayloadHash: text("schedule_payload_hash"),
    sourceObservedAt: timestamp("source_observed_at", {
      withTimezone: true,
    }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("teams_provider_external_uidx").on(
      table.provider,
      table.externalId,
    ),
  ],
);

export const games = pgTable(
  "games",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canonicalId: text("canonical_id").notNull().unique(),
    sport: sportEnum("sport").notNull(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    summary: jsonb("summary").$type<GameSummary>().notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    sourceObservedAt: timestamp("source_observed_at", {
      withTimezone: true,
    }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("games_provider_external_uidx").on(
      table.provider,
      table.externalId,
    ),
    index("games_scheduled_at_idx").on(table.scheduledAt),
  ],
);

export const teamGames = pgTable(
  "team_games",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.gameId] }),
    index("team_games_game_idx").on(table.gameId),
  ],
);

export const gameSnapshots = pgTable(
  "game_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    routeId: text("route_id").notNull().unique(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    schemaVersion: integer("schema_version").default(1).notNull(),
    snapshot: jsonb("snapshot").$type<GameSnapshot>().notNull(),
    sourceObservedAt: timestamp("source_observed_at", {
      withTimezone: true,
    }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("game_snapshots_game_team_uidx").on(table.gameId, table.teamId),
    index("game_snapshots_expiry_idx").on(table.expiresAt),
  ],
);

export const ingestionRuns = pgTable(
  "ingestion_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    operation: text("operation").notNull(),
    scope: text("scope").notNull(),
    status: ingestionStatusEnum("status").notNull(),
    attemptCount: integer("attempt_count").default(1).notNull(),
    durationMs: integer("duration_ms"),
    cacheResult: cacheResultEnum("cache_result"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    requestId: text("request_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("ingestion_runs_recent_idx").on(table.provider, table.startedAt),
    uniqueIndex("ingestion_runs_active_lease_uidx")
      .on(table.provider, table.operation, table.scope)
      .where(sql`${table.status} = 'running'`),
  ],
);

/**
 * One row per generation attempt. The row is also the quota counter: a claimed
 * slot is an inserted row, so counting rows for a session or IP hash over the
 * current UTC day is the quota check. No raw IP address, watchlist text, or
 * user note is ever stored here — only hashes and sanitized codes.
 *
 * ponytail: routeId + inputHash + snapshotObservedAt instead of a snapshot_id
 * foreign key. A FK would mean threading the game_snapshots row id through
 * readStoredSnapshot -> getGameDetail -> GameDetailData for no extra
 * auditability. Add the FK if a join is ever actually needed.
 */
export const briefingRuns = pgTable(
  "briefing_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    routeId: text("route_id").notNull(),
    sport: sportEnum("sport").notNull(),
    sessionHash: text("session_hash").notNull(),
    ipHash: text("ip_hash").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    inputHash: text("input_hash").notNull(),
    snapshotObservedAt: timestamp("snapshot_observed_at", {
      withTimezone: true,
    }),
    output: jsonb("output").$type<Briefing>(),
    status: briefingStatusEnum("status").notNull(),
    mode: briefingModeEnum("mode"),
    validationStatus: text("validation_status"),
    attemptCount: integer("attempt_count").default(1).notNull(),
    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    estimatedCostMicros: integer("estimated_cost_micros"),
    errorCode: text("error_code"),
    requestId: text("request_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("briefing_runs_session_day_idx").on(
      table.sessionHash,
      table.startedAt,
    ),
    index("briefing_runs_ip_day_idx").on(table.ipHash, table.startedAt),
    index("briefing_runs_recent_idx").on(table.startedAt),
  ],
);
