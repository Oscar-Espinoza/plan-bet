CREATE TYPE "public"."game_comment_phase" AS ENUM('before', 'after');--> statement-breakpoint
CREATE TABLE "game_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"canonical_game_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"phase" "game_comment_phase" NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_comments" ADD CONSTRAINT "game_comments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_comments" ADD CONSTRAINT "game_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_comments_one_per_phase_uidx" ON "game_comments" USING btree ("group_id","canonical_game_id","user_id","phase");--> statement-breakpoint
CREATE INDEX "game_comments_thread_idx" ON "game_comments" USING btree ("group_id","canonical_game_id","created_at");