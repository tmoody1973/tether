CREATE TABLE "used_start_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
