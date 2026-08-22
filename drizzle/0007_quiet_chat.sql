CREATE TYPE "public"."buddy_role" AS ENUM('user', 'buddy');--> statement-breakpoint
CREATE TYPE "public"."buddy_status" AS ENUM('ok', 'rejected', 'failed');--> statement-breakpoint
CREATE TABLE "buddy_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation" uuid NOT NULL,
	"user_id" uuid,
	"session_hash" text NOT NULL,
	"ip_hash" text NOT NULL,
	"role" "buddy_role" NOT NULL,
	"text" text NOT NULL,
	"route" text NOT NULL,
	"fact_ids" text[] DEFAULT '{}' NOT NULL,
	"pick_id" text,
	"status" "buddy_status" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buddy_messages" ADD CONSTRAINT "buddy_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buddy_messages_conversation_idx" ON "buddy_messages" USING btree ("conversation","created_at");--> statement-breakpoint
CREATE INDEX "buddy_messages_session_day_idx" ON "buddy_messages" USING btree ("session_hash","created_at") WHERE "buddy_messages"."role" = 'user';--> statement-breakpoint
CREATE INDEX "buddy_messages_ip_day_idx" ON "buddy_messages" USING btree ("ip_hash","created_at") WHERE "buddy_messages"."role" = 'user';