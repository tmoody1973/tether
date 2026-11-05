ALTER TABLE "families" ADD COLUMN "commitment_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "pending_commitment_cents" integer;