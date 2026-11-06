ALTER TABLE "families" ADD COLUMN "demo" jsonb;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "ledger_void_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "ledger_void_to" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "journal" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;