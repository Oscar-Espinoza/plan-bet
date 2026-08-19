CREATE TYPE "public"."briefing_mode" AS ENUM('live', 'fallback');--> statement-breakpoint
CREATE TYPE "public"."briefing_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "briefing_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" text NOT NULL,
	"sport" "sport" NOT NULL,
	"session_hash" text NOT NULL,
	"ip_hash" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"snapshot_observed_at" timestamp with time zone,
	"output" jsonb,
	"status" "briefing_status" NOT NULL,
	"mode" "briefing_mode",
	"validation_status" text,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost_micros" integer,
	"error_code" text,
	"request_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "briefing_runs_session_day_idx" ON "briefing_runs" USING btree ("session_hash","started_at");--> statement-breakpoint
CREATE INDEX "briefing_runs_ip_day_idx" ON "briefing_runs" USING btree ("ip_hash","started_at");--> statement-breakpoint
CREATE INDEX "briefing_runs_recent_idx" ON "briefing_runs" USING btree ("started_at");