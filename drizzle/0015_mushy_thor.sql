ALTER TABLE "wagers" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "wagers_user_idempotency_uidx" ON "wagers" USING btree ("user_id","idempotency_key");