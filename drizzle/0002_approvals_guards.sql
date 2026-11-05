ALTER TABLE "approvals" ADD COLUMN "expired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "note" text;--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_one_open_uq" ON "approvals" USING btree ("family_id","subject","subject_id") WHERE "approvals"."result" is null and "approvals"."expired_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "grants_family_version_uq" ON "grants" USING btree ("family_id","version");