ALTER TABLE "families" ADD COLUMN "guardian_token" text;--> statement-breakpoint
-- Existing families get a random key too (two v4 UUIDs = 244 random bits); new rows get randomBytes(24) from the app.
UPDATE "families" SET "guardian_token" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') WHERE "guardian_token" IS NULL;--> statement-breakpoint
ALTER TABLE "families" ALTER COLUMN "guardian_token" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_guardian_token_unique" UNIQUE("guardian_token");
