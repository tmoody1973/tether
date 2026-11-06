CREATE TABLE "usage" (
	"family_id" text NOT NULL,
	"kind" text NOT NULL,
	"day" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_family_id_kind_day_pk" PRIMARY KEY("family_id","kind","day")
);
--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;