import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
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

// Auth.js tables. Column TS keys below are read by @auth/drizzle-adapter and
// must not be renamed (emailVerified, providerAccountId, refresh_token,
// sessionToken, ...); only the SQL names are ours.
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

export const buddyRoleEnum = pgEnum("buddy_role", ["user", "buddy"]);
export const buddyStatusEnum = pgEnum("buddy_status", [
  "ok",
  "rejected",
  "failed",
]);

/**
 * One row per turn, not one row per conversation: a conversation is a
 * client-held uuid, and a separate conversations table would hold nothing a
 * `group by` on this one can't answer. `route` is the resolved context kind
 * and scope ("game", "you", "group"), never a raw URL or querystring.
 */
export const buddyMessages = pgTable(
  "buddy_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversation: uuid("conversation").notNull(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }), // null for signed-out browsing
    sessionHash: text("session_hash").notNull(),
    ipHash: text("ip_hash").notNull(),
    role: buddyRoleEnum("role").notNull(),
    text: text("text").notNull(),
    route: text("route").notNull(),
    factIds: text("fact_ids").array().notNull().default([]),
    pickId: text("pick_id"),
    status: buddyStatusEnum("status").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
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
  ],
);

export const groupMemberRoleEnum = pgEnum("group_member_role", [
  "owner",
  "member",
]);

export const groupInviteStatusEnum = pgEnum("group_invite_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);

export const groups = pgTable("groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: groupMemberRoleEnum("role").notNull(),
    notifyOnActivity: boolean("notify_on_activity").default(true).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index("group_members_user_idx").on(table.userId),
  ],
);

/**
 * Invites target an email address, not a user id — the invitee may not have
 * signed in yet. Accepted once the invitee is signed in with a matching
 * email; classid 5 (the advisory-lock class this feature claims, see
 * CLAUDE.md) serializes concurrent accepts of the same token. A NULL email
 * is a shareable join link: nobody in particular was invited, so accepting
 * one skips the email match entirely (Phase C).
 */
export const groupInvites = pgTable(
  "group_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    email: text("email"),
    token: text("token").notNull().unique(),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: groupInviteStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("group_invites_group_idx").on(table.groupId),
    index("group_invites_email_idx").on(table.email),
  ],
);

/**
 * Append-only, one row per placement. No `status` column, no `updated_at`,
 * no update or delete path anywhere: a wager's state is derived from whether
 * a `credit_entries` row with kind `return` exists for it (Session 09).
 * `canonicalId`/`matchup`/`competition` are copied at placement time so a
 * wager stays fully readable after its game snapshot expires or is replaced.
 */
export const wagers = pgTable(
  "wagers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Null for a solo wager. Set once at insert time, like every other
    // wagers column — never updated after placement.
    groupId: uuid("group_id").references(() => groups.id),
    canonicalGameId: text("canonical_game_id").notNull(), // football-data-564645 / mlb-777123
    routeId: text("route_id").notNull(), // team-perspective page it was placed from
    sport: sportEnum("sport").notNull(),
    marketId: text("market_id").notNull(),
    selectionId: text("selection_id").notNull(),
    marketLabel: text("market_label").notNull(),
    selectionLabel: text("selection_label").notNull(),
    line: numeric("line", { precision: 5, scale: 1, mode: "number" }),
    // numeric, not real: float4 cannot hold 1.85 exactly, and "the stored
    // price never changes" has to be literally true.
    price: numeric("price", {
      precision: 6,
      scale: 2,
      mode: "number",
    }).notNull(),
    stake: integer("stake").notNull(),
    potentialReturn: integer("potential_return").notNull(),
    matchup: text("matchup").notNull(),
    competition: text("competition").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    pricesVersion: text("prices_version").notNull(),
    rulesVersion: text("rules_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("wagers_user_created_idx").on(table.userId, table.createdAt),
    index("wagers_game_idx").on(table.canonicalGameId),
    index("wagers_group_idx").on(table.groupId),
  ],
);

export const creditEntryKindEnum = pgEnum("credit_entry_kind", [
  "grant",
  "stake",
  "return",
  "reset",
]);

// No "push": every published market line ends in .5 (see markets.ts), so a
// push is unreachable and grading only ever needs won/lost/void.
export const creditEntryOutcomeEnum = pgEnum("credit_entry_outcome", [
  "won",
  "lost",
  "void",
]);

/**
 * Append-only. There is no update or delete path anywhere in application code:
 * balance is `sum(amount)`, and a reset is a new row, not an edit.
 */
export const creditEntries = pgTable(
  "credit_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: creditEntryKindEnum("kind").notNull(),
    amount: integer("amount").notNull(), // signed, whole credits
    reason: text("reason").notNull(), // why this row exists
    wagerId: uuid("wager_id").references(() => wagers.id),
    // outcome / settlementRunId (Session 09): set only on kind = 'return',
    // the settlement record itself — there is no separate settlements table.
    // Null on every other kind (grant, stake, reset).
    outcome: creditEntryOutcomeEnum("outcome"),
    settlementRunId: uuid("settlement_run_id").references(
      () => ingestionRuns.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("credit_entries_user_created_idx").on(table.userId, table.createdAt),
    // The real guarantee behind "concurrent account creation cannot produce two
    // grants" — same technique as ingestion_runs_active_lease_uidx.
    uniqueIndex("credit_entries_user_grant_uidx")
      .on(table.userId)
      .where(sql`${table.kind} = 'grant'`),
    // Settlement (Session 09) inserts exactly one return row per wager,
    // conflict-do-nothing, so a repeated settlement run can never pay twice.
    uniqueIndex("credit_entries_wager_return_uidx")
      .on(table.wagerId)
      .where(sql`${table.kind} = 'return'`),
  ],
);
