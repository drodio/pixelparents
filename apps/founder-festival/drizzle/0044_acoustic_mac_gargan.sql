CREATE TABLE "changelog_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"shipped_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"bullets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"change_type" text NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"commit_sha" text,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "changelog_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "changelog_entries_slug_unique" ON "changelog_entries" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "changelog_entries_commit_sha_unique" ON "changelog_entries" USING btree ("commit_sha");--> statement-breakpoint
CREATE INDEX "changelog_entries_shipped_at_idx" ON "changelog_entries" USING btree ("shipped_at");--> statement-breakpoint
CREATE UNIQUE INDEX "changelog_subscribers_clerk_user_id_unique" ON "changelog_subscribers" USING btree ("clerk_user_id");