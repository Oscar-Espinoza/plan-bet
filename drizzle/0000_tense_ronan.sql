CREATE TYPE "public"."cache_result" AS ENUM('hit', 'miss', 'refreshed', 'stale', 'demo');--> statement-breakpoint
CREATE TYPE "public"."ingestion_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sport" AS ENUM('soccer', 'baseball');--> statement-breakpoint
CREATE TABLE "game_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" text NOT NULL,
	"game_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"snapshot" jsonb NOT NULL,
	"source_observed_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_snapshots_route_id_unique" UNIQUE("route_id")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_id" text NOT NULL,
	"sport" "sport" NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"summary" jsonb NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"source_observed_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_canonical_id_unique" UNIQUE("canonical_id")
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"scope" text NOT NULL,
	"status" "ingestion_status" NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"duration_ms" integer,
	"cache_result" "cache_result",
	"error_code" text,
	"error_message" text,
	"request_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "team_games" (
	"team_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	CONSTRAINT "team_games_team_id_game_id_pk" PRIMARY KEY("team_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"sport" "sport" NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"canonical" jsonb NOT NULL,
	"schedule" jsonb,
	"schedule_fetched_at" timestamp with time zone,
	"schedule_expires_at" timestamp with time zone,
	"schedule_payload_hash" text,
	"source_observed_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "game_snapshots" ADD CONSTRAINT "game_snapshots_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_snapshots" ADD CONSTRAINT "game_snapshots_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_games" ADD CONSTRAINT "team_games_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_games" ADD CONSTRAINT "team_games_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_snapshots_game_team_uidx" ON "game_snapshots" USING btree ("game_id","team_id");--> statement-breakpoint
CREATE INDEX "game_snapshots_expiry_idx" ON "game_snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "games_provider_external_uidx" ON "games" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "games_scheduled_at_idx" ON "games" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "ingestion_runs_recent_idx" ON "ingestion_runs" USING btree ("provider","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_runs_active_lease_uidx" ON "ingestion_runs" USING btree ("provider","operation","scope") WHERE "ingestion_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "team_games_game_idx" ON "team_games" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_provider_external_uidx" ON "teams" USING btree ("provider","external_id");