import { randomUUID } from "node:crypto";
import type { SqlValue } from "./sql-text.ts";
import { IMPORT_ORDER } from "./tables.ts";

export type Row = Record<string, unknown>;

export type MappedTable = {
  target: string;
  sourceTable: string;
  columns: string[];
  rows: SqlValue[][];
  sourceCount: number;
  skipped: number;
};

export type TableCount = {
  sourceTable: string;
  source: number;
  skipped: number;
  imported: number;
};

export type TransformPlan = {
  failed: boolean;
  failure: string | null;
  warnings: string[];
  skippedUsers: { id: string; reason: string }[];
  notMigrated: {
    table: string;
    target: string;
    rows: number;
    reason: string;
  }[];
  tables: MappedTable[];
  counts: Record<string, TableCount>;
};

export type UserMetrics = {
  balance: number;
  wagerCount: number;
  openWagers: number;
  stakeSum: number;
  returnSum: number;
};

export function emailOf(row: Row): string | null {
  if (typeof row.email !== "string") return null;
  const email = row.email.trim();
  return email.length > 0 ? email : null;
}

export function uuidText(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value).toLowerCase();
}

export function toEpochMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string") {
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      const n = Number(value);
      return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  throw new Error(`Unparseable timestamp ${JSON.stringify(value)}`);
}

export function scaleDecimal(value: unknown, places: number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`bad decimal ${value}`);
    return Math.round(value * 10 ** places);
  }
  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error(`bad decimal ${text}`);
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, frac = ""] = unsigned.split(".");
  const digits = (frac + "0".repeat(places)).slice(0, places);
  const roundUp = (frac[places] ?? "0") >= "5";
  let scaled = BigInt(whole) * 10n ** BigInt(places) + BigInt(digits || "0");
  if (roundUp) scaled += 1n;
  if (negative) scaled = -scaled;
  return Number(scaled);
}

export function planTransform(
  tables: Map<string, Row[]>,
  exportedAtMs: number,
): TransformPlan {
  const warnings: string[] = [];
  const problems: string[] = [];
  const users = rows(tables, "users");
  const accounts = rows(tables, "accounts");
  const sessions = rows(tables, "sessions");
  const tokens = rows(tables, "verification_tokens");
  const skippedUsers: { id: string; reason: string }[] = [];
  const skipped = new Set<string>();

  for (const user of users) {
    if (emailOf(user)) continue;
    const id = required(uuidText(user.id), "users.id");
    skipped.add(id);
    skippedUsers.push({ id, reason: "missing email" });
    warnings.push(`skipped user ${id}: missing email`);
  }

  flagOwners(rows(tables, "wagers"), "user_id", "wagers", skipped, problems);
  flagOwners(
    rows(tables, "credit_entries"),
    "user_id",
    "credit_entries",
    skipped,
    problems,
  );
  flagOwners(
    rows(tables, "groups"),
    "created_by_user_id",
    "groups",
    skipped,
    problems,
  );
  flagOwners(
    rows(tables, "group_members"),
    "user_id",
    "group_members",
    skipped,
    problems,
  );
  flagOwners(
    rows(tables, "group_invites"),
    "invited_by_user_id",
    "group_invites",
    skipped,
    problems,
  );
  flagOwners(
    rows(tables, "game_comments"),
    "user_id",
    "game_comments",
    skipped,
    problems,
  );
  flagOwners(
    rows(tables, "comment_votes"),
    "user_id",
    "comment_votes",
    skipped,
    problems,
  );

  const notMigrated = [
    {
      table: "sessions",
      target: "session",
      rows: sessions.length,
      reason: "Auth.js sessions are not migrated; everyone signs in again",
    },
    {
      table: "verification_tokens",
      target: "verification",
      rows: tokens.length,
      reason: "Auth.js verification tokens are not migrated",
    },
  ];

  if (problems.length > 0) {
    return {
      failed: true,
      failure: problems.join("\n"),
      warnings,
      skippedUsers,
      notMigrated,
      tables: [],
      counts: emptyCounts(tables, skippedUsers.length),
    };
  }

  const keptIds = new Set(
    users
      .map((user) => uuidText(user.id))
      .filter((id): id is string => id != null && !skipped.has(id)),
  );
  const seenEmails = new Map<string, string>();
  const userRows: SqlValue[][] = [];
  for (const user of users) {
    const email = emailOf(user);
    if (!email) continue;
    const id = required(uuidText(user.id), "users.id");
    const prior = seenEmails.get(email);
    if (prior) {
      problems.push(`duplicate email ${email} on users ${prior} and ${id}`);
      continue;
    }
    seenEmails.set(email, id);
    const created = msOr(user.created_at, exportedAtMs);
    userRows.push([
      id,
      displayName(user, email),
      email,
      user.email_verified == null ? 0 : 1,
      textOf(user.image),
      created,
      created,
    ]);
  }

  const accountRows: SqlValue[][] = [];
  let accountsSkipped = 0;
  for (const account of accounts) {
    const userId = required(uuidText(account.user_id), "accounts.user_id");
    if (skipped.has(userId)) {
      accountsSkipped += 1;
      warnings.push(
        `skipped account ${textOf(account.provider)}/${textOf(account.provider_account_id)}: user ${userId} has no email`,
      );
      continue;
    }
    if (!keptIds.has(userId)) {
      problems.push(`account references unknown user ${userId}`);
      continue;
    }
    accountRows.push([
      randomUUID(),
      requiredText(account, "provider_account_id"),
      requiredText(account, "provider"),
      userId,
      textOf(account.access_token),
      textOf(account.refresh_token),
      textOf(account.id_token),
      accessExpiry(account.expires_at),
      null,
      textOf(account.scope),
      null,
      exportedAtMs,
      exportedAtMs,
    ]);
  }

  if (problems.length > 0) {
    return {
      failed: true,
      failure: problems.join("\n"),
      warnings,
      skippedUsers,
      notMigrated,
      tables: [],
      counts: emptyCounts(tables, skippedUsers.length),
    };
  }

  const mapped = new Map<string, MappedTable>();
  mapped.set(
    "user",
    table(
      "user",
      "users",
      [
        "id",
        "name",
        "email",
        "email_verified",
        "image",
        "created_at",
        "updated_at",
      ],
      userRows,
      users.length,
      skippedUsers.length,
    ),
  );
  mapped.set(
    "account",
    table(
      "account",
      "accounts",
      [
        "id",
        "account_id",
        "provider_id",
        "user_id",
        "access_token",
        "refresh_token",
        "id_token",
        "access_token_expires_at",
        "refresh_token_expires_at",
        "scope",
        "password",
        "created_at",
        "updated_at",
      ],
      accountRows,
      accounts.length,
      accountsSkipped,
    ),
  );
  mapped.set("teams", mapTeams(rows(tables, "teams"), exportedAtMs));
  mapped.set("games", mapGames(rows(tables, "games"), exportedAtMs));
  mapped.set("team_games", mapTeamGames(rows(tables, "team_games")));
  mapped.set(
    "game_snapshots",
    mapSnapshots(rows(tables, "game_snapshots"), exportedAtMs),
  );
  mapped.set(
    "ingestion_runs",
    mapIngestion(rows(tables, "ingestion_runs"), exportedAtMs),
  );
  mapped.set(
    "provider_cache",
    mapCache(rows(tables, "provider_cache"), exportedAtMs),
  );
  mapped.set("groups", mapGroups(rows(tables, "groups"), exportedAtMs));
  mapped.set(
    "group_members",
    mapMembers(rows(tables, "group_members"), exportedAtMs),
  );
  mapped.set(
    "group_invites",
    mapInvites(rows(tables, "group_invites"), exportedAtMs),
  );
  mapped.set("wagers", mapWagers(rows(tables, "wagers"), exportedAtMs));
  mapped.set(
    "credit_entries",
    mapCredits(rows(tables, "credit_entries"), exportedAtMs),
  );
  mapped.set(
    "fixture_context",
    mapFixture(rows(tables, "fixture_context"), exportedAtMs),
  );
  mapped.set(
    "game_comments",
    mapComments(orderComments(rows(tables, "game_comments")), exportedAtMs),
  );
  mapped.set(
    "comment_votes",
    mapVotes(rows(tables, "comment_votes"), exportedAtMs),
  );
  mapped.set(
    "buddy_messages",
    mapMessages(
      rows(tables, "buddy_messages"),
      skipped,
      warnings,
      exportedAtMs,
    ),
  );
  mapped.set(
    "buddy_notes",
    mapNotes(rows(tables, "buddy_notes"), skipped, warnings, exportedAtMs),
  );

  const ordered = IMPORT_ORDER.map((name) => {
    const item = mapped.get(name);
    if (!item) throw new Error(`missing mapped table ${name}`);
    return item;
  });

  return {
    failed: false,
    failure: null,
    warnings,
    skippedUsers,
    notMigrated,
    tables: ordered,
    counts: countsFrom(ordered, sessions.length, tokens.length),
  };
}

export function sourceUserMetrics(
  userIds: readonly string[],
  wagers: readonly Row[],
  entries: readonly Row[],
): Map<string, UserMetrics> {
  const metrics = new Map<string, UserMetrics>();
  for (const id of userIds) {
    metrics.set(id, {
      balance: 0,
      wagerCount: 0,
      openWagers: 0,
      stakeSum: 0,
      returnSum: 0,
    });
  }
  const settled = new Set<string>();
  for (const entry of entries) {
    const userId = uuidText(entry.user_id);
    const bucket = userId ? metrics.get(userId) : undefined;
    if (!bucket) continue;
    bucket.balance += asInt(entry.amount, "credit amount");
    if (entry.kind === "return") {
      bucket.returnSum += asInt(entry.amount, "return amount");
      const wagerId = uuidText(entry.wager_id);
      if (wagerId) settled.add(wagerId);
    }
  }
  for (const wager of wagers) {
    const userId = uuidText(wager.user_id);
    const bucket = userId ? metrics.get(userId) : undefined;
    if (!bucket) continue;
    bucket.wagerCount += 1;
    bucket.stakeSum += asInt(wager.stake, "stake");
    const id = uuidText(wager.id);
    if (id && !settled.has(id)) bucket.openWagers += 1;
  }
  return metrics;
}

function rows(tables: Map<string, Row[]>, name: string): Row[] {
  const found = tables.get(name);
  if (!found) throw new Error(`export is missing ${name}`);
  return found;
}

function table(
  target: string,
  sourceTable: string,
  columns: string[],
  body: SqlValue[][],
  sourceCount: number,
  skipped: number,
): MappedTable {
  return { target, sourceTable, columns, rows: body, sourceCount, skipped };
}

function countsFrom(
  mapped: readonly MappedTable[],
  sessions: number,
  tokens: number,
): Record<string, TableCount> {
  const counts: Record<string, TableCount> = {};
  for (const item of mapped) {
    counts[item.target] = {
      sourceTable: item.sourceTable,
      source: item.sourceCount,
      skipped: item.skipped,
      imported: item.rows.length,
    };
  }
  counts.session = {
    sourceTable: "sessions",
    source: sessions,
    skipped: sessions,
    imported: 0,
  };
  counts.verification = {
    sourceTable: "verification_tokens",
    source: tokens,
    skipped: tokens,
    imported: 0,
  };
  return counts;
}

function emptyCounts(
  tables: Map<string, Row[]>,
  skippedUsers: number,
): Record<string, TableCount> {
  const count = (
    sourceTable: string,
    target: string,
    skipped = 0,
  ): TableCount => ({
    sourceTable,
    source: rows(tables, sourceTable).length,
    skipped,
    imported: 0,
  });
  return {
    user: count("users", "user", skippedUsers),
    account: count("accounts", "account"),
    session: {
      sourceTable: "sessions",
      source: rows(tables, "sessions").length,
      skipped: rows(tables, "sessions").length,
      imported: 0,
    },
    verification: {
      sourceTable: "verification_tokens",
      source: rows(tables, "verification_tokens").length,
      skipped: rows(tables, "verification_tokens").length,
      imported: 0,
    },
    teams: count("teams", "teams"),
    games: count("games", "games"),
    team_games: count("team_games", "team_games"),
    game_snapshots: count("game_snapshots", "game_snapshots"),
    ingestion_runs: count("ingestion_runs", "ingestion_runs"),
    provider_cache: count("provider_cache", "provider_cache"),
    groups: count("groups", "groups"),
    group_members: count("group_members", "group_members"),
    group_invites: count("group_invites", "group_invites"),
    wagers: count("wagers", "wagers"),
    credit_entries: count("credit_entries", "credit_entries"),
    fixture_context: count("fixture_context", "fixture_context"),
    game_comments: count("game_comments", "game_comments"),
    comment_votes: count("comment_votes", "comment_votes"),
    buddy_messages: count("buddy_messages", "buddy_messages"),
    buddy_notes: count("buddy_notes", "buddy_notes"),
  };
}

function flagOwners(
  body: readonly Row[],
  column: string,
  label: string,
  skipped: Set<string>,
  problems: string[],
) {
  for (const row of body) {
    const id = uuidText(row[column]);
    if (!id || !skipped.has(id)) continue;
    const rowId = uuidText(row.id) ?? uuidText(row.comment_id) ?? "?";
    problems.push(`${label} ${rowId} references user ${id} who has no email`);
  }
}

function displayName(row: Row, email: string | null): string {
  if (typeof row.name === "string" && row.name.trim().length > 0)
    return row.name;
  if (email) {
    const local = email.split("@")[0]?.trim() ?? "";
    if (local.length > 0) return local;
  }
  return "User";
}

function textOf(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function requiredText(row: Row, key: string): string {
  const value = textOf(row[key]);
  if (value == null) throw new Error(`missing ${key}`);
  return value;
}

function required<T>(value: T | null, label: string): T {
  if (value == null) throw new Error(`missing ${label}`);
  return value;
}

function msOr(value: unknown, fallback: number): number {
  if (value == null || value === "") return fallback;
  return toEpochMs(value);
}

function optMs(value: unknown): number | null {
  if (value == null || value === "") return null;
  return toEpochMs(value);
}

function jsonOf(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    JSON.parse(value);
    return value;
  }
  return JSON.stringify(value);
}

function requiredJson(row: Row, key: string): string {
  return required(jsonOf(row[key]), key);
}

function intOr(value: unknown, fallback: number): number {
  if (value == null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n))
    throw new Error(`expected integer, got ${JSON.stringify(value)}`);
  return n;
}

function asInt(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n))
    throw new Error(`expected integer ${label}, got ${JSON.stringify(value)}`);
  return n;
}

function boolOr(value: unknown, fallback: number): number {
  if (value == null || value === "") return fallback;
  if (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "t" ||
    value === "true"
  ) {
    return 1;
  }
  if (
    value === false ||
    value === 0 ||
    value === "0" ||
    value === "f" ||
    value === "false"
  ) {
    return 0;
  }
  throw new Error(`bad boolean ${JSON.stringify(value)}`);
}

function accessExpiry(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n))
    throw new Error(`bad expires_at ${JSON.stringify(value)}`);
  return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
}

function optScale(value: unknown, places: number): number | null {
  if (value == null || value === "") return null;
  return scaleDecimal(value, places);
}

function mapTeams(body: Row[], exportedAtMs: number): MappedTable {
  return table(
    "teams",
    "teams",
    [
      "id",
      "slug",
      "sport",
      "provider",
      "external_id",
      "canonical",
      "schedule",
      "schedule_fetched_at",
      "schedule_expires_at",
      "schedule_payload_hash",
      "source_observed_at",
      "fetched_at",
      "expires_at",
      "payload_hash",
      "created_at",
      "updated_at",
    ],
    body.map((row) => [
      required(uuidText(row.id), "teams.id"),
      requiredText(row, "slug"),
      requiredText(row, "sport"),
      requiredText(row, "provider"),
      requiredText(row, "external_id"),
      requiredJson(row, "canonical"),
      jsonOf(row.schedule),
      optMs(row.schedule_fetched_at),
      optMs(row.schedule_expires_at),
      textOf(row.schedule_payload_hash),
      msOr(row.source_observed_at, exportedAtMs),
      msOr(row.fetched_at, exportedAtMs),
      msOr(row.expires_at, exportedAtMs),
      requiredText(row, "payload_hash"),
      msOr(row.created_at, exportedAtMs),
      msOr(row.updated_at, exportedAtMs),
    ]),
    body.length,
    0,
  );
}

function mapGames(body: Row[], exportedAtMs: number): MappedTable {
  return table(
    "games",
    "games",
    [
      "id",
      "canonical_id",
      "sport",
      "provider",
      "external_id",
      "summary",
      "scheduled_at",
      "source_observed_at",
      "fetched_at",
      "expires_at",
      "payload_hash",
      "created_at",
      "updated_at",
    ],
    body.map((row) => [
      required(uuidText(row.id), "games.id"),
      requiredText(row, "canonical_id"),
      requiredText(row, "sport"),
      requiredText(row, "provider"),
      requiredText(row, "external_id"),
      requiredJson(row, "summary"),
      msOr(row.scheduled_at, exportedAtMs),
      msOr(row.source_observed_at, exportedAtMs),
      msOr(row.fetched_at, exportedAtMs),
      msOr(row.expires_at, exportedAtMs),
      requiredText(row, "payload_hash"),
      msOr(row.created_at, exportedAtMs),
      msOr(row.updated_at, exportedAtMs),
    ]),
    body.length,
    0,
  );
}

function mapTeamGames(body: Row[]): MappedTable {
  return table(
    "team_games",
    "team_games",
    ["team_id", "game_id"],
    body.map((row) => [
      required(uuidText(row.team_id), "team_games.team_id"),
      required(uuidText(row.game_id), "team_games.game_id"),
    ]),
    body.length,
    0,
  );
}

function mapSnapshots(body: Row[], exportedAtMs: number): MappedTable {
  return table(
    "game_snapshots",
    "game_snapshots",
    [
      "id",
      "route_id",
      "game_id",
      "team_id",
      "schema_version",
      "snapshot",
      "source_observed_at",
      "fetched_at",
      "expires_at",
      "payload_hash",
      "created_at",
      "updated_at",
    ],
    body.map((row) => [
      required(uuidText(row.id), "game_snapshots.id"),
      requiredText(row, "route_id"),
      required(uuidText(row.game_id), "game_snapshots.game_id"),
      required(uuidText(row.team_id), "game_snapshots.team_id"),
      intOr(row.schema_version, 1),
      requiredJson(row, "snapshot"),
      msOr(row.source_observed_at, exportedAtMs),
      msOr(row.fetched_at, exportedAtMs),
      msOr(row.expires_at, exportedAtMs),
      requiredText(row, "payload_hash"),
      msOr(row.created_at, exportedAtMs),
      msOr(row.updated_at, exportedAtMs),
    ]),
    body.length,
    0,
  );
}

function mapIngestion(body: Row[], exportedAtMs: number): MappedTable {
  return table(
    "ingestion_runs",
    "ingestion_runs",
    [
      "id",
      "provider",
      "operation",
      "scope",
      "status",
      "attempt_count",
      "duration_ms",
      "cache_result",
      "error_code",
      "error_message",
      "request_id",
      "started_at",
      "completed_at",
    ],
    body.map((row) => [
      required(uuidText(row.id), "ingestion_runs.id"),
      requiredText(row, "provider"),
      requiredText(row, "operation"),
      requiredText(row, "scope"),
      requiredText(row, "status"),
      intOr(row.attempt_count, 1),
      row.duration_ms == null ? null : intOr(row.duration_ms, 0),
      textOf(row.cache_result),
      textOf(row.error_code),
      textOf(row.error_message),
      requiredText(row, "request_id"),
      msOr(row.started_at, exportedAtMs),
      optMs(row.completed_at),
    ]),
    body.length,
    0,
  );
}

function mapCache(body: Row[], exportedAtMs: number): MappedTable {
  return table(
    "provider_cache",
    "provider_cache",
    ["id", "provider", "kind", "scope", "payload", "fetched_at", "expires_at"],
    body.map((row) => [
      required(uuidText(row.id), "provider_cache.id"),
      requiredText(row, "provider"),
      requiredText(row, "kind"),
      requiredText(row, "scope"),
      requiredJson(row, "payload"),
      msOr(row.fetched_at, exportedAtMs),
      msOr(row.expires_at, exportedAtMs),
    ]),
    body.length,
    0,
  );
}

function mapGroups(body: Row[], exportedAtMs: number): MappedTable {
  return table(
    "groups",
    "groups",
    ["id", "name", "slug", "created_by_user_id", "created_at"],
    body.map((row) => [
      required(uuidText(row.id), "groups.id"),
      requiredText(row, "name"),
      requiredText(row, "slug"),
      required(uuidText(row.created_by_user_id), "groups.created_by_user_id"),
      msOr(row.created_at, exportedAtMs),
    ]),
    body.length,
    0,
  );
}

function mapMembers(body: Row[], exportedAtMs: number): MappedTable {
  return table(
    "group_members",
    "group_members",
    ["group_id", "user_id", "role", "notify_on_activity", "joined_at"],
    body.map((row) => [
      required(uuidText(row.group_id), "group_members.group_id"),
      required(uuidText(row.user_id), "group_members.user_id"),
      requiredText(row, "role"),
      boolOr(row.notify_on_activity, 1),
      msOr(row.joined_at, exportedAtMs),
    ]),
    body.length,
    0,
  );
}

function mapInvites(body: Row[], exportedAtMs: number): MappedTable {
  return table(
    "group_invites",
    "group_invites",
    [
      "id",
      "group_id",
      "email",
      "token",
      "invited_by_user_id",
      "status",
      "created_at",
      "expires_at",
    ],
    body.map((row) => [
      required(uuidText(row.id), "group_invites.id"),
      required(uuidText(row.group_id), "group_invites.group_id"),
      textOf(row.email),
      requiredText(row, "token"),
      required(
        uuidText(row.invited_by_user_id),
        "group_invites.invited_by_user_id",
      ),
      requiredText(row, "status"),
      msOr(row.created_at, exportedAtMs),
      msOr(row.expires_at, exportedAtMs),
    ]),
    body.length,
    0,
  );
}

function mapWagers(body: Row[], exportedAtMs: number): MappedTable {
  return table(
    "wagers",
    "wagers",
    [
      "id",
      "user_id",
      "group_id",
      "canonical_game_id",
      "route_id",
      "sport",
      "market_id",
      "selection_id",
      "market_label",
      "selection_label",
      "line_tenths",
      "price_hundredths",
      "stake",
      "potential_return",
      "matchup",
      "competition",
      "scheduled_at",
      "prices_version",
      "rules_version",
      "idempotency_key",
      "created_at",
    ],
    body.map((row) => [
      required(uuidText(row.id), "wagers.id"),
      required(uuidText(row.user_id), "wagers.user_id"),
      uuidText(row.group_id),
      requiredText(row, "canonical_game_id"),
      requiredText(row, "route_id"),
      requiredText(row, "sport"),
      requiredText(row, "market_id"),
      requiredText(row, "selection_id"),
      requiredText(row, "market_label"),
      requiredText(row, "selection_label"),
      optScale(row.line, 1),
      scaleDecimal(row.price, 2),
      intOr(row.stake, 0),
      intOr(row.potential_return, 0),
      requiredText(row, "matchup"),
      requiredText(row, "competition"),
      msOr(row.scheduled_at, exportedAtMs),
      requiredText(row, "prices_version"),
      requiredText(row, "rules_version"),
      uuidText(row.idempotency_key),
      msOr(row.created_at, exportedAtMs),
    ]),
    body.length,
    0,
  );
}

function mapCredits(body: Row[], exportedAtMs: number): MappedTable {
  return table(
    "credit_entries",
    "credit_entries",
    [
      "id",
      "user_id",
      "kind",
      "amount",
      "reason",
      "wager_id",
      "outcome",
      "settlement_run_id",
      "created_at",
    ],
    body.map((row) => [
      required(uuidText(row.id), "credit_entries.id"),
      required(uuidText(row.user_id), "credit_entries.user_id"),
      requiredText(row, "kind"),
      intOr(row.amount, 0),
      requiredText(row, "reason"),
      uuidText(row.wager_id),
      textOf(row.outcome),
      uuidText(row.settlement_run_id),
      msOr(row.created_at, exportedAtMs),
    ]),
    body.length,
    0,
  );
}

function mapFixture(body: Row[], exportedAtMs: number): MappedTable {
  return table(
    "fixture_context",
    "fixture_context",
    ["id", "game_id", "facts", "summary", "built_at"],
    body.map((row) => [
      required(uuidText(row.id), "fixture_context.id"),
      required(uuidText(row.game_id), "fixture_context.game_id"),
      requiredJson(row, "facts"),
      requiredText(row, "summary"),
      msOr(row.built_at, exportedAtMs),
    ]),
    body.length,
    0,
  );
}

function mapComments(body: Row[], exportedAtMs: number): MappedTable {
  return table(
    "game_comments",
    "game_comments",
    [
      "id",
      "group_id",
      "canonical_game_id",
      "user_id",
      "parent_comment_id",
      "phase",
      "body",
      "created_at",
    ],
    body.map((row) => [
      required(uuidText(row.id), "game_comments.id"),
      required(uuidText(row.group_id), "game_comments.group_id"),
      requiredText(row, "canonical_game_id"),
      required(uuidText(row.user_id), "game_comments.user_id"),
      uuidText(row.parent_comment_id),
      requiredText(row, "phase"),
      requiredText(row, "body"),
      msOr(row.created_at, exportedAtMs),
    ]),
    body.length,
    0,
  );
}

function mapVotes(body: Row[], exportedAtMs: number): MappedTable {
  return table(
    "comment_votes",
    "comment_votes",
    ["comment_id", "user_id", "kind", "created_at"],
    body.map((row) => [
      required(uuidText(row.comment_id), "comment_votes.comment_id"),
      required(uuidText(row.user_id), "comment_votes.user_id"),
      requiredText(row, "kind"),
      msOr(row.created_at, exportedAtMs),
    ]),
    body.length,
    0,
  );
}

function mapMessages(
  body: Row[],
  skipped: Set<string>,
  warnings: string[],
  exportedAtMs: number,
): MappedTable {
  return table(
    "buddy_messages",
    "buddy_messages",
    [
      "id",
      "conversation",
      "user_id",
      "session_hash",
      "ip_hash",
      "role",
      "text",
      "route",
      "fact_ids",
      "pick_id",
      "status",
      "reason",
      "created_at",
    ],
    body.map((row) => [
      required(uuidText(row.id), "buddy_messages.id"),
      required(uuidText(row.conversation), "buddy_messages.conversation"),
      clearSkippedUser(row, skipped, warnings, "buddy_messages"),
      requiredText(row, "session_hash"),
      requiredText(row, "ip_hash"),
      requiredText(row, "role"),
      requiredText(row, "text"),
      requiredText(row, "route"),
      row.fact_ids == null ? "[]" : required(jsonOf(row.fact_ids), "fact_ids"),
      textOf(row.pick_id),
      requiredText(row, "status"),
      textOf(row.reason),
      msOr(row.created_at, exportedAtMs),
    ]),
    body.length,
    0,
  );
}

function mapNotes(
  body: Row[],
  skipped: Set<string>,
  warnings: string[],
  exportedAtMs: number,
): MappedTable {
  return table(
    "buddy_notes",
    "buddy_notes",
    ["id", "user_id", "session_hash", "note", "created_at"],
    body.map((row) => [
      required(uuidText(row.id), "buddy_notes.id"),
      clearSkippedUser(row, skipped, warnings, "buddy_notes"),
      requiredText(row, "session_hash"),
      requiredText(row, "note"),
      msOr(row.created_at, exportedAtMs),
    ]),
    body.length,
    0,
  );
}

function clearSkippedUser(
  row: Row,
  skipped: Set<string>,
  warnings: string[],
  label: string,
): string | null {
  const id = uuidText(row.user_id);
  if (id && skipped.has(id)) {
    warnings.push(
      `${label} ${uuidText(row.id)}: cleared user_id ${id} (user has no email)`,
    );
    return null;
  }
  return id;
}

function orderComments(body: readonly Row[]): Row[] {
  const byId = new Map<string, Row>();
  for (const row of body) {
    const id = required(uuidText(row.id), "game_comments.id");
    byId.set(id, row);
  }
  const placed = new Set<string>();
  const visiting = new Set<string>();
  const ordered: Row[] = [];
  const visit = (row: Row) => {
    const id = required(uuidText(row.id), "game_comments.id");
    if (placed.has(id)) return;
    if (visiting.has(id)) throw new Error(`comment cycle at ${id}`);
    visiting.add(id);
    const parent = uuidText(row.parent_comment_id);
    if (parent) {
      const parentRow = byId.get(parent);
      if (!parentRow)
        throw new Error(`comment ${id} is missing parent ${parent}`);
      visit(parentRow);
    }
    visiting.delete(id);
    placed.add(id);
    ordered.push(row);
  };
  for (const row of body) visit(row);
  return ordered;
}
