ALTER TABLE "purchases" ADD COLUMN "charge" jsonb;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "charge_error" text;--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_capture_uq" ON "receipts" USING btree ("capture_id");