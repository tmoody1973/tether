CREATE TABLE "usage_pool" (
	"kind" text NOT NULL,
	"day" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_pool_kind_day_pk" PRIMARY KEY("kind","day")
);
--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "paypal_sub" text;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "paypal_payer_id" text;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "paypal_email" text;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "parent_given_name" text;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "teen_link_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "families_paypal_sub_idx" ON "families" USING btree ("paypal_sub");