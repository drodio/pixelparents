CREATE TABLE "app_stats" (
	"key" text PRIMARY KEY NOT NULL,
	"value" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
