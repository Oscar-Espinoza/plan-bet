CREATE TABLE "fixture_context" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"facts" jsonb NOT NULL,
	"summary" text NOT NULL,
	"built_at" timestamp with time zone NOT NULL,
	CONSTRAINT "fixture_context_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
CREATE TABLE "provider_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"scope" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fixture_context" ADD CONSTRAINT "fixture_context_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_cache_key_uidx" ON "provider_cache" USING btree ("provider","kind","scope");--> statement-breakpoint
CREATE INDEX "provider_cache_expiry_idx" ON "provider_cache" USING btree ("expires_at");