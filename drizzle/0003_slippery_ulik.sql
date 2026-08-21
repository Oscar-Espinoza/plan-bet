CREATE TABLE "wagers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"canonical_game_id" text NOT NULL,
	"route_id" text NOT NULL,
	"sport" "sport" NOT NULL,
	"market_id" text NOT NULL,
	"selection_id" text NOT NULL,
	"market_label" text NOT NULL,
	"selection_label" text NOT NULL,
	"line" numeric(5, 1),
	"price" numeric(6, 2) NOT NULL,
	"stake" integer NOT NULL,
	"potential_return" integer NOT NULL,
	"matchup" text NOT NULL,
	"competition" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"prices_version" text NOT NULL,
	"rules_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wagers" ADD CONSTRAINT "wagers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wagers_user_created_idx" ON "wagers" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "wagers_game_idx" ON "wagers" USING btree ("canonical_game_id");--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_wager_id_wagers_id_fk" FOREIGN KEY ("wager_id") REFERENCES "public"."wagers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_entries_wager_return_uidx" ON "credit_entries" USING btree ("wager_id") WHERE "credit_entries"."kind" = 'return';