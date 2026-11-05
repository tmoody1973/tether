ALTER TABLE "investments" ADD COLUMN "debited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "receipt_note" text;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_invest_ref_uq" ON "journal" USING btree ("kind","ref") WHERE "journal"."kind" in ('invest', 'invest_reversal');