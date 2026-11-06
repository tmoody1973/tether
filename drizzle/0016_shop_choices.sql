CREATE TABLE "shop_choices" (
	"family_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"choice" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "shop_choices_family_id_merchant_id_pk" PRIMARY KEY("family_id","merchant_id")
);
--> statement-breakpoint
ALTER TABLE "shop_choices" ADD CONSTRAINT "shop_choices_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_choices" ADD CONSTRAINT "shop_choices_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;