ALTER TYPE "public"."group_invite_status" ADD VALUE 'revoked';--> statement-breakpoint
ALTER TABLE "group_invites" ALTER COLUMN "email" DROP NOT NULL;