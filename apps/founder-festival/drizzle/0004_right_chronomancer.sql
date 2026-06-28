-- Vanity profile URLs: evaluations.slug + slug_kind for
-- /profile/<kind>/<name-slug>; users.clerk_username for the preferred
-- /profile/<username>. Idempotent — already applied to dev + prod Neon
-- branches via the API on 2026-05-25; this file just keeps the migration
-- history in sync for any fresh-bootstrap of the DB.
ALTER TABLE "evaluations" ADD COLUMN IF NOT EXISTS "slug" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN IF NOT EXISTS "slug_kind" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clerk_username" text;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "evaluations_slug_kind_slug_unique"
    ON "evaluations" USING btree ("slug_kind","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_clerk_username_lower_idx"
    ON "users" USING btree (lower("clerk_username"));
