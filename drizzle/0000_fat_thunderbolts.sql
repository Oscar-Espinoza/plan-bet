CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `buddy_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation` text NOT NULL,
	`user_id` text,
	`session_hash` text NOT NULL,
	`ip_hash` text NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`route` text NOT NULL,
	`fact_ids` text DEFAULT (json_array()) NOT NULL,
	`pick_id` text,
	`status` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "buddy_messages_role_check" CHECK("buddy_messages"."role" in ('user', 'buddy')),
	CONSTRAINT "buddy_messages_status_check" CHECK("buddy_messages"."status" in ('ok', 'rejected', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `buddy_messages_conversation_idx` ON `buddy_messages` (`conversation`,`created_at`);--> statement-breakpoint
CREATE INDEX `buddy_messages_session_day_idx` ON `buddy_messages` (`session_hash`,`created_at`) WHERE "buddy_messages"."role" = 'user';--> statement-breakpoint
CREATE INDEX `buddy_messages_ip_day_idx` ON `buddy_messages` (`ip_hash`,`created_at`) WHERE "buddy_messages"."role" = 'user';--> statement-breakpoint
CREATE TABLE `buddy_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`session_hash` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `buddy_notes_session_created_idx` ON `buddy_notes` (`session_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `comment_votes` (
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`comment_id`, `user_id`, `kind`),
	FOREIGN KEY (`comment_id`) REFERENCES `game_comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "comment_votes_kind_check" CHECK("comment_votes"."kind" in ('shame', 'slander'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comment_votes_comment_id_user_id_kind_pk` ON `comment_votes` (`comment_id`,`user_id`,`kind`);--> statement-breakpoint
CREATE INDEX `comment_votes_comment_idx` ON `comment_votes` (`comment_id`);--> statement-breakpoint
CREATE TABLE `credit_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`wager_id` text,
	`outcome` text,
	`settlement_run_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`wager_id`) REFERENCES `wagers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`settlement_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "credit_entries_kind_check" CHECK("credit_entries"."kind" in ('grant', 'stake', 'return', 'reset')),
	CONSTRAINT "credit_entries_outcome_check" CHECK("credit_entries"."outcome" in ('won', 'lost', 'void'))
);
--> statement-breakpoint
CREATE INDEX `credit_entries_user_created_idx` ON `credit_entries` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `credit_entries_wager_activity_idx` ON `credit_entries` (`wager_id`) WHERE "credit_entries"."kind" in ('stake', 'return');--> statement-breakpoint
CREATE UNIQUE INDEX `credit_entries_user_grant_uidx` ON `credit_entries` (`user_id`) WHERE "credit_entries"."kind" = 'grant';--> statement-breakpoint
CREATE UNIQUE INDEX `credit_entries_wager_return_uidx` ON `credit_entries` (`wager_id`) WHERE "credit_entries"."kind" = 'return';--> statement-breakpoint
CREATE TABLE `fixture_context` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`facts` text NOT NULL,
	`summary` text NOT NULL,
	`built_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fixture_context_game_id_unique` ON `fixture_context` (`game_id`);--> statement-breakpoint
CREATE TABLE `game_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`canonical_game_id` text NOT NULL,
	`user_id` text NOT NULL,
	`parent_comment_id` text,
	`phase` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_comment_id`) REFERENCES `game_comments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "game_comments_phase_check" CHECK("game_comments"."phase" in ('before', 'after'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_comments_one_per_phase_uidx` ON `game_comments` (`group_id`,`canonical_game_id`,`user_id`,`phase`);--> statement-breakpoint
CREATE INDEX `game_comments_parent_idx` ON `game_comments` (`parent_comment_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `game_comments_thread_idx` ON `game_comments` (`group_id`,`canonical_game_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `game_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`route_id` text NOT NULL,
	`game_id` text NOT NULL,
	`team_id` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`snapshot` text NOT NULL,
	`source_observed_at` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_snapshots_route_id_unique` ON `game_snapshots` (`route_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `game_snapshots_game_team_uidx` ON `game_snapshots` (`game_id`,`team_id`);--> statement-breakpoint
CREATE INDEX `game_snapshots_expiry_idx` ON `game_snapshots` (`expires_at`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_id` text NOT NULL,
	`sport` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`summary` text NOT NULL,
	`status` text GENERATED ALWAYS AS (json_extract("summary", '$.status')) VIRTUAL,
	`scheduled_at` integer NOT NULL,
	`source_observed_at` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "games_sport_check" CHECK("games"."sport" in ('soccer', 'baseball'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_canonical_id_unique` ON `games` (`canonical_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `games_provider_external_uidx` ON `games` (`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `games_scheduled_at_idx` ON `games` (`scheduled_at`);--> statement-breakpoint
CREATE INDEX `games_status_scheduled_at_idx` ON `games` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `group_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`email` text,
	`token` text NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "group_invites_status_check" CHECK("group_invites"."status" in ('pending', 'accepted', 'expired', 'revoked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_invites_token_unique` ON `group_invites` (`token`);--> statement-breakpoint
CREATE INDEX `group_invites_group_idx` ON `group_invites` (`group_id`);--> statement-breakpoint
CREATE INDEX `group_invites_email_idx` ON `group_invites` (`email`);--> statement-breakpoint
CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`notify_on_activity` integer DEFAULT true NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "group_members_role_check" CHECK("group_members"."role" in ('owner', 'member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_members_group_id_user_id_pk` ON `group_members` (`group_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `group_members_user_idx` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_slug_unique` ON `groups` (`slug`);--> statement-breakpoint
CREATE TABLE `ingestion_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`operation` text NOT NULL,
	`scope` text NOT NULL,
	`status` text NOT NULL,
	`attempt_count` integer DEFAULT 1 NOT NULL,
	`duration_ms` integer,
	`cache_result` text,
	`error_code` text,
	`error_message` text,
	`request_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	CONSTRAINT "ingestion_runs_status_check" CHECK("ingestion_runs"."status" in ('running', 'succeeded', 'failed')),
	CONSTRAINT "ingestion_runs_cache_result_check" CHECK("ingestion_runs"."cache_result" in ('hit', 'miss', 'refreshed', 'stale', 'demo'))
);
--> statement-breakpoint
CREATE INDEX `ingestion_runs_recent_idx` ON `ingestion_runs` (`provider`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ingestion_runs_active_lease_uidx` ON `ingestion_runs` (`provider`,`operation`,`scope`) WHERE "ingestion_runs"."status" = 'running';--> statement-breakpoint
CREATE TABLE `provider_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`scope` text NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_cache_key_uidx` ON `provider_cache` (`provider`,`kind`,`scope`);--> statement-breakpoint
CREATE INDEX `provider_cache_expiry_idx` ON `provider_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `team_games` (
	`team_id` text NOT NULL,
	`game_id` text NOT NULL,
	PRIMARY KEY(`team_id`, `game_id`),
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_games_team_id_game_id_pk` ON `team_games` (`team_id`,`game_id`);--> statement-breakpoint
CREATE INDEX `team_games_game_idx` ON `team_games` (`game_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`sport` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`canonical` text NOT NULL,
	`schedule` text,
	`schedule_fetched_at` integer,
	`schedule_expires_at` integer,
	`schedule_payload_hash` text,
	`source_observed_at` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "teams_sport_check" CHECK("teams"."sport" in ('soccer', 'baseball'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_slug_unique` ON `teams` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `teams_provider_external_uidx` ON `teams` (`provider`,`external_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `wagers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`group_id` text,
	`canonical_game_id` text NOT NULL,
	`route_id` text NOT NULL,
	`sport` text NOT NULL,
	`market_id` text NOT NULL,
	`selection_id` text NOT NULL,
	`market_label` text NOT NULL,
	`selection_label` text NOT NULL,
	`line_tenths` integer,
	`price_hundredths` integer NOT NULL,
	`stake` integer NOT NULL,
	`potential_return` integer NOT NULL,
	`matchup` text NOT NULL,
	`competition` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`prices_version` text NOT NULL,
	`rules_version` text NOT NULL,
	`idempotency_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "wagers_sport_check" CHECK("wagers"."sport" in ('soccer', 'baseball'))
);
--> statement-breakpoint
CREATE INDEX `wagers_user_created_idx` ON `wagers` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `wagers_user_idempotency_uidx` ON `wagers` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `wagers_game_idx` ON `wagers` (`canonical_game_id`);--> statement-breakpoint
CREATE INDEX `wagers_group_idx` ON `wagers` (`group_id`);--> statement-breakpoint
CREATE INDEX `wagers_user_game_group_idx` ON `wagers` (`user_id`,`canonical_game_id`,`group_id`);--> statement-breakpoint
CREATE INDEX `wagers_group_game_user_idx` ON `wagers` (`group_id`,`canonical_game_id`,`user_id`);