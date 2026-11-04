import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  customType,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type {
  EvidenceFact,
  GameSchedule,
  GameSnapshot,
  GameSummary,
  Team,
} from "../domain/contracts";

/**
 * Postgres → D1 type rules (spec §3.6):
 * uuid text + crypto.randomUUID(); timestamptz integer ms; jsonb text json;
 * pg enums text + CHECK; price numeric(6,2) → price_hundredths; line numeric(5,1) → line_tenths.
 */

const sports = ["soccer", "baseball"] as const;
const ingestionStatuses = ["running", "succeeded", "failed"] as const;
const cacheResults = ["hit", "miss", "refreshed", "stale", "demo"] as const;
const buddyRoles = ["user", "buddy"] as const;
const buddyStatuses = ["ok", "rejected", "failed"] as const;
const groupMemberRoles = ["owner", "member"] as const;
const groupInviteStatuses = [
  "pending",
  "accepted",
  "expired",
  "revoked",
] as const;
const creditEntryKinds = ["grant", "stake", "return", "reset"] as const;
const creditEntryOutcomes = ["won", "lost", "void"] as const;
const gameCommentPhases = ["before", "after"] as const;
const commentVoteKinds = ["shame", "slander"] as const;

const priceHundredths = customType<{ data: number; driverData: number }>({
  dataType() {
    return "integer";
  },
  toDriver(value: number) {
    return Math.round(value * 100);
  },
  fromDriver(value: number) {
    return value / 100;
  },
});

const lineTenths = customType<{ data: number; driverData: number }>({
  dataType() {
    return "integer";
  },
  toDriver(value: number) {
    return Math.round(value * 10);
  },
  fromDriver(value: number) {
    return value / 10;
  },
});

function oneOf(column: SQLWrapper, values: readonly string[]) {
  return sql`${column} in (${sql.join(
    values.map((value) => sql.raw(`'${value}'`)),
    sql.raw(", "),
  )})`;
}

function rowId() {
  return text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
}

function timestampMs(name: string) {
  return integer(name, { mode: "timestamp_ms" });
}

function requiredNow(name: string) {
  return timestampMs(name)
    .notNull()
    .$defaultFn(() => new Date());
}

const authTimestampDefault = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const teams = sqliteTable(
  "teams",
  {
    id: rowId(),
    slug: text("slug").notNull(),
    sport: text("sport", { enum: sports }).notNull(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    canonical: text("canonical", { mode: "json" }).$type<Team>().notNull(),
    schedule: text("schedule", { mode: "json" }).$type<GameSchedule>(),
    scheduleFetchedAt: timestampMs("schedule_fetched_at"),
    scheduleExpiresAt: timestampMs("schedule_expires_at"),
    schedulePayloadHash: text("schedule_payload_hash"),
    sourceObservedAt: timestampMs("source_observed_at").notNull(),
    fetchedAt: timestampMs("fetched_at").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: requiredNow("created_at"),
    updatedAt: requiredNow("updated_at"),
  },
  (table) => [
    uniqueIndex("teams_slug_unique").on(table.slug),
    uniqueIndex("teams_provider_external_uidx").on(
      table.provider,
      table.externalId,
    ),
    check("teams_sport_check", oneOf(table.sport, sports)),
  ],
);

export const games = sqliteTable(
  "games",
  {
    id: rowId(),
    canonicalId: text("canonical_id").notNull(),
    sport: text("sport", { enum: sports }).notNull(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    summary: text("summary", { mode: "json" }).$type<GameSummary>().notNull(),
    // Virtual so settlement and the board can filter `summary.status` without parsing JSON.
    status: text("status").generatedAlwaysAs(
      (): SQL => sql`json_extract(${games.summary}, '$.status')`,
      { mode: "virtual" },
    ),
    scheduledAt: timestampMs("scheduled_at").notNull(),
    sourceObservedAt: timestampMs("source_observed_at").notNull(),
    fetchedAt: timestampMs("fetched_at").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: requiredNow("created_at"),
    updatedAt: requiredNow("updated_at"),
  },
  (table) => [
    uniqueIndex("games_canonical_id_unique").on(table.canonicalId),
    uniqueIndex("games_provider_external_uidx").on(
      table.provider,
      table.externalId,
    ),
    index("games_scheduled_at_idx").on(table.scheduledAt),
    index("games_status_scheduled_at_idx").on(table.status, table.scheduledAt),
    check("games_sport_check", oneOf(table.sport, sports)),
  ],
);

export const teamGames = sqliteTable(
  "team_games",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({
      name: "team_games_team_id_game_id_pk",
      columns: [table.teamId, table.gameId],
    }),
    // SQLite names the automatic PRIMARY KEY index sqlite_autoindex_*.
    // The legacy constraint name is created again so sqlite_master lists it.
    uniqueIndex("team_games_team_id_game_id_pk").on(table.teamId, table.gameId),
    index("team_games_game_idx").on(table.gameId),
  ],
);

export const gameSnapshots = sqliteTable(
  "game_snapshots",
  {
    id: rowId(),
    routeId: text("route_id").notNull(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    schemaVersion: integer("schema_version").default(1).notNull(),
    snapshot: text("snapshot", { mode: "json" })
      .$type<GameSnapshot>()
      .notNull(),
    sourceObservedAt: timestampMs("source_observed_at").notNull(),
    fetchedAt: timestampMs("fetched_at").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: requiredNow("created_at"),
    updatedAt: requiredNow("updated_at"),
  },
  (table) => [
    uniqueIndex("game_snapshots_route_id_unique").on(table.routeId),
    uniqueIndex("game_snapshots_game_team_uidx").on(table.gameId, table.teamId),
    index("game_snapshots_expiry_idx").on(table.expiresAt),
  ],
);

export const ingestionRuns = sqliteTable(
  "ingestion_runs",
  {
    id: rowId(),
    provider: text("provider").notNull(),
    operation: text("operation").notNull(),
    scope: text("scope").notNull(),
    status: text("status", { enum: ingestionStatuses }).notNull(),
    attemptCount: integer("attempt_count").default(1).notNull(),
    durationMs: integer("duration_ms"),
    cacheResult: text("cache_result", { enum: cacheResults }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    requestId: text("request_id").notNull(),
    startedAt: requiredNow("started_at"),
    completedAt: timestampMs("completed_at"),
  },
  (table) => [
    index("ingestion_runs_recent_idx").on(table.provider, table.startedAt),
    uniqueIndex("ingestion_runs_active_lease_uidx")
      .on(table.provider, table.operation, table.scope)
      .where(sql`${table.status} = 'running'`),
    check(
      "ingestion_runs_status_check",
      oneOf(table.status, ingestionStatuses),
    ),
    check(
      "ingestion_runs_cache_result_check",
      oneOf(table.cacheResult, cacheResults),
    ),
  ],
);

/**
 * Better Auth core tables (user, session, account, verification), Drizzle sqlite
 * column names from the 1.7 CLI schema. Legacy users/sessions/accounts/
 * verification_tokens are not created. Every legacy FK to users.id points at user.id.
 */
export const user = sqliteTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(authTimestampDefault)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(authTimestampDefault)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(authTimestampDefault)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(authTimestampDefault)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(authTimestampDefault)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(authTimestampDefault)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const buddyMessages = sqliteTable(
  "buddy_messages",
  {
    id: rowId(),
    conversation: text("conversation").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    sessionHash: text("session_hash").notNull(),
    ipHash: text("ip_hash").notNull(),
    role: text("role", { enum: buddyRoles }).notNull(),
    text: text("text").notNull(),
    route: text("route").notNull(),
    factIds: text("fact_ids", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`(json_array())`),
    pickId: text("pick_id"),
    status: text("status", { enum: buddyStatuses }).notNull(),
    reason: text("reason"),
    createdAt: requiredNow("created_at"),
  },
  (table) => [
    index("buddy_messages_conversation_idx").on(
      table.conversation,
      table.createdAt,
    ),
    index("buddy_messages_session_day_idx")
      .on(table.sessionHash, table.createdAt)
      .where(sql`${table.role} = 'user'`),
    index("buddy_messages_ip_day_idx")
      .on(table.ipHash, table.createdAt)
      .where(sql`${table.role} = 'user'`),
    check("buddy_messages_role_check", oneOf(table.role, buddyRoles)),
    check("buddy_messages_status_check", oneOf(table.status, buddyStatuses)),
  ],
);

export const buddyNotes = sqliteTable(
  "buddy_notes",
  {
    id: rowId(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    sessionHash: text("session_hash").notNull(),
    note: text("note").notNull(),
    createdAt: requiredNow("created_at"),
  },
  (table) => [
    index("buddy_notes_session_created_idx").on(
      table.sessionHash,
      table.createdAt,
    ),
  ],
);

export const groups = sqliteTable(
  "groups",
  {
    id: rowId(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: requiredNow("created_at"),
  },
  (table) => [uniqueIndex("groups_slug_unique").on(table.slug)],
);

export const groupMembers = sqliteTable(
  "group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: groupMemberRoles }).notNull(),
    notifyOnActivity: integer("notify_on_activity", { mode: "boolean" })
      .default(true)
      .notNull(),
    joinedAt: requiredNow("joined_at"),
  },
  (table) => [
    primaryKey({
      name: "group_members_group_id_user_id_pk",
      columns: [table.groupId, table.userId],
    }),
    uniqueIndex("group_members_group_id_user_id_pk").on(
      table.groupId,
      table.userId,
    ),
    index("group_members_user_idx").on(table.userId),
    check("group_members_role_check", oneOf(table.role, groupMemberRoles)),
  ],
);

export const groupInvites = sqliteTable(
  "group_invites",
  {
    id: rowId(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    email: text("email"),
    token: text("token").notNull(),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: groupInviteStatuses })
      .default("pending")
      .notNull(),
    createdAt: requiredNow("created_at"),
    expiresAt: timestampMs("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("group_invites_token_unique").on(table.token),
    // One live join link per group. Email invites (email not null) are excluded.
    // Expired rows leave this index when accept or createJoinLink sets status.
    uniqueIndex("group_invites_one_pending_link_uidx")
      .on(table.groupId)
      .where(sql`${table.email} is null and ${table.status} = 'pending'`),
    index("group_invites_group_idx").on(table.groupId),
    index("group_invites_email_idx").on(table.email),
    check(
      "group_invites_status_check",
      oneOf(table.status, groupInviteStatuses),
    ),
  ],
);

/**
 * Append-only. No status column: a wager's state is whether a credit_entries
 * row with kind 'return' exists. Prices are stored as integer hundredths and
 * lines as integer tenths; the custom types expose a plain number to code.
 */
export const wagers = sqliteTable(
  "wagers",
  {
    id: rowId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    groupId: text("group_id").references(() => groups.id),
    canonicalGameId: text("canonical_game_id").notNull(),
    routeId: text("route_id").notNull(),
    sport: text("sport", { enum: sports }).notNull(),
    marketId: text("market_id").notNull(),
    selectionId: text("selection_id").notNull(),
    marketLabel: text("market_label").notNull(),
    selectionLabel: text("selection_label").notNull(),
    line: lineTenths("line_tenths"),
    price: priceHundredths("price_hundredths").notNull(),
    stake: integer("stake").notNull(),
    potentialReturn: integer("potential_return").notNull(),
    matchup: text("matchup").notNull(),
    competition: text("competition").notNull(),
    scheduledAt: timestampMs("scheduled_at").notNull(),
    pricesVersion: text("prices_version").notNull(),
    rulesVersion: text("rules_version").notNull(),
    idempotencyKey: text("idempotency_key"),
    createdAt: requiredNow("created_at"),
  },
  (table) => [
    index("wagers_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("wagers_user_idempotency_uidx").on(
      table.userId,
      table.idempotencyKey,
    ),
    index("wagers_game_idx").on(table.canonicalGameId),
    index("wagers_group_idx").on(table.groupId),
    index("wagers_user_game_group_idx").on(
      table.userId,
      table.canonicalGameId,
      table.groupId,
    ),
    index("wagers_group_game_user_idx").on(
      table.groupId,
      table.canonicalGameId,
      table.userId,
    ),
    check("wagers_sport_check", oneOf(table.sport, sports)),
  ],
);

/**
 * Append-only. Balance is sum(amount). One grant per user and one return per
 * wager are partial unique indexes, not application checks.
 */
export const creditEntries = sqliteTable(
  "credit_entries",
  {
    id: rowId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: creditEntryKinds }).notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    wagerId: text("wager_id").references(() => wagers.id),
    outcome: text("outcome", { enum: creditEntryOutcomes }),
    settlementRunId: text("settlement_run_id").references(
      () => ingestionRuns.id,
    ),
    createdAt: requiredNow("created_at"),
  },
  (table) => [
    index("credit_entries_user_created_idx").on(table.userId, table.createdAt),
    index("credit_entries_wager_activity_idx")
      .on(table.wagerId)
      .where(sql`${table.kind} in ('stake', 'return')`),
    uniqueIndex("credit_entries_user_grant_uidx")
      .on(table.userId)
      .where(sql`${table.kind} = 'grant'`),
    uniqueIndex("credit_entries_wager_return_uidx")
      .on(table.wagerId)
      .where(sql`${table.kind} = 'return'`),
    check("credit_entries_kind_check", oneOf(table.kind, creditEntryKinds)),
    check(
      "credit_entries_outcome_check",
      oneOf(table.outcome, creditEntryOutcomes),
    ),
  ],
);

export const providerCache = sqliteTable(
  "provider_cache",
  {
    id: rowId(),
    provider: text("provider").notNull(),
    kind: text("kind").notNull(),
    scope: text("scope").notNull(),
    payload: text("payload", { mode: "json" }).$type<unknown>().notNull(),
    fetchedAt: timestampMs("fetched_at").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("provider_cache_key_uidx").on(
      table.provider,
      table.kind,
      table.scope,
    ),
    index("provider_cache_expiry_idx").on(table.expiresAt),
  ],
);

export const fixtureContext = sqliteTable(
  "fixture_context",
  {
    id: rowId(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    facts: text("facts", { mode: "json" }).$type<EvidenceFact[]>().notNull(),
    summary: text("summary").notNull(),
    builtAt: timestampMs("built_at").notNull(),
  },
  (table) => [uniqueIndex("fixture_context_game_id_unique").on(table.gameId)],
);

export const gameComments = sqliteTable(
  "game_comments",
  {
    id: rowId(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    canonicalGameId: text("canonical_game_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    parentCommentId: text("parent_comment_id").references(
      (): AnySQLiteColumn => gameComments.id,
      { onDelete: "restrict" },
    ),
    phase: text("phase", { enum: gameCommentPhases }).notNull(),
    body: text("body").notNull(),
    createdAt: requiredNow("created_at"),
  },
  (table) => [
    uniqueIndex("game_comments_one_per_phase_uidx").on(
      table.groupId,
      table.canonicalGameId,
      table.userId,
      table.phase,
    ),
    index("game_comments_parent_idx").on(
      table.parentCommentId,
      table.createdAt,
    ),
    index("game_comments_thread_idx").on(
      table.groupId,
      table.canonicalGameId,
      table.createdAt,
    ),
    check("game_comments_phase_check", oneOf(table.phase, gameCommentPhases)),
  ],
);

export const commentVotes = sqliteTable(
  "comment_votes",
  {
    commentId: text("comment_id")
      .notNull()
      .references(() => gameComments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: commentVoteKinds }).notNull(),
    createdAt: requiredNow("created_at"),
  },
  (table) => [
    primaryKey({
      name: "comment_votes_comment_id_user_id_kind_pk",
      columns: [table.commentId, table.userId, table.kind],
    }),
    uniqueIndex("comment_votes_comment_id_user_id_kind_pk").on(
      table.commentId,
      table.userId,
      table.kind,
    ),
    index("comment_votes_comment_idx").on(table.commentId),
    check("comment_votes_kind_check", oneOf(table.kind, commentVoteKinds)),
  ],
);
