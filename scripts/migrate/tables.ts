/** Legacy public tables, in an order that is safe to read. Primary keys match the Postgres schema. */
export const SOURCE_TABLES: readonly {
  name: string;
  orderBy: readonly string[];
}[] = [
  { name: "teams", orderBy: ["id"] },
  { name: "games", orderBy: ["id"] },
  { name: "team_games", orderBy: ["team_id", "game_id"] },
  { name: "game_snapshots", orderBy: ["id"] },
  { name: "ingestion_runs", orderBy: ["id"] },
  { name: "users", orderBy: ["id"] },
  { name: "accounts", orderBy: ["provider", "provider_account_id"] },
  { name: "sessions", orderBy: ["session_token"] },
  { name: "verification_tokens", orderBy: ["identifier", "token"] },
  { name: "buddy_messages", orderBy: ["id"] },
  { name: "buddy_notes", orderBy: ["id"] },
  { name: "groups", orderBy: ["id"] },
  { name: "group_members", orderBy: ["group_id", "user_id"] },
  { name: "group_invites", orderBy: ["id"] },
  { name: "wagers", orderBy: ["id"] },
  { name: "credit_entries", orderBy: ["id"] },
  { name: "provider_cache", orderBy: ["id"] },
  { name: "fixture_context", orderBy: ["id"] },
  { name: "game_comments", orderBy: ["id"] },
  { name: "comment_votes", orderBy: ["comment_id", "user_id", "kind"] },
];

/** D1 insert order. Parents come before children. `session` and `verification` are not loaded. */
export const IMPORT_ORDER = [
  "teams",
  "games",
  "team_games",
  "game_snapshots",
  "ingestion_runs",
  "provider_cache",
  "user",
  "account",
  "groups",
  "group_members",
  "group_invites",
  "wagers",
  "credit_entries",
  "fixture_context",
  "game_comments",
  "comment_votes",
  "buddy_messages",
  "buddy_notes",
] as const;

export const RECONCILE_TABLES = [
  ...IMPORT_ORDER,
  "session",
  "verification",
] as const;
