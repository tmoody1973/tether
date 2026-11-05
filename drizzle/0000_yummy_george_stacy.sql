CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"subject" text NOT NULL,
	"subject_id" text NOT NULL,
	"cart_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"result" text,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "consumed_tokens" (
	"token_id" text PRIMARY KEY NOT NULL,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"teen_token" text NOT NULL,
	"clock_offset_ms" bigint DEFAULT 0 NOT NULL,
	"guardian_name" text NOT NULL,
	"teen_name" text NOT NULL,
	CONSTRAINT "families_teen_token_unique" UNIQUE("teen_token")
);
--> statement-breakpoint
CREATE TABLE "fund_allowlist" (
	"family_id" text NOT NULL,
	"symbol" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fund_allowlist_family_id_symbol_pk" PRIMARY KEY("family_id","symbol")
);
--> statement-breakpoint
CREATE TABLE "fund_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"symbol" text NOT NULL,
	"answers" jsonb NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"family_id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"target_cents" integer NOT NULL,
	"channel3_product_id" text
);
--> statement-breakpoint
CREATE TABLE "grants" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"version" integer NOT NULL,
	"level" integer NOT NULL,
	"body" jsonb NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"symbol" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"answers" jsonb NOT NULL,
	"status" text NOT NULL,
	"alpaca_account_id" text,
	"transfer_id" text,
	"order_id" text
);
--> statement-breakpoint
CREATE TABLE "journal" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"ref" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "level_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"from_level" integer NOT NULL,
	"to_level" integer NOT NULL,
	"by" text NOT NULL,
	"reason" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"class" text NOT NULL,
	"channel3_website_id" text,
	"paypal_payee_email" text,
	"opens_at_level" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"cart" jsonb NOT NULL,
	"cart_hash" text NOT NULL,
	"decision" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_id" text NOT NULL,
	"capture_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"grant_version" integer NOT NULL,
	"cart_hash" text NOT NULL,
	"decision" jsonb NOT NULL,
	"approval_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"saved_cents" integer NOT NULL,
	"match_cents" integer NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vault" (
	"family_id" text PRIMARY KEY NOT NULL,
	"payment_token_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "weeks" (
	"family_id" text NOT NULL,
	"week_key" text NOT NULL,
	"allowance_cents" integer NOT NULL,
	"commitment_cents" integer NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "weeks_family_id_week_key_pk" PRIMARY KEY("family_id","week_key")
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_allowlist" ADD CONSTRAINT "fund_allowlist_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_proposals" ADD CONSTRAINT "fund_proposals_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal" ADD CONSTRAINT "journal_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_changes" ADD CONSTRAINT "level_changes_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault" ADD CONSTRAINT "vault_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weeks" ADD CONSTRAINT "weeks_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;