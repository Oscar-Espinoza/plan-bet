CREATE TYPE "public"."credit_entry_outcome" AS ENUM('won', 'lost', 'void');--> statement-breakpoint
ALTER TABLE "credit_entries" ADD COLUMN "outcome" "credit_entry_outcome";--> statement-breakpoint
ALTER TABLE "credit_entries" ADD COLUMN "settlement_run_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_settlement_run_id_ingestion_runs_id_fk" FOREIGN KEY ("settlement_run_id") REFERENCES "public"."ingestion_runs"("id") ON DELETE no action ON UPDATE no action;