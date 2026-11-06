ALTER TABLE "approvals" ADD COLUMN "lifts_budget" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "over_cents" integer;