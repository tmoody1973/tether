ALTER TABLE "grants" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "weeks" ADD COLUMN "stopped" boolean DEFAULT false NOT NULL;