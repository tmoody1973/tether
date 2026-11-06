ALTER TABLE "purchases" ADD COLUMN "charge_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "charge_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "paypal_order_id" text;