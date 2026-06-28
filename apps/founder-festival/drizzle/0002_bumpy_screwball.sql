-- Schema drift cleanup: capture columns that lived in src/db/schema.ts but
-- never had a migration file. Both have already been applied to the dev and
-- prod Neon branches via ad-hoc ALTER TABLE; this file just brings the
-- migration history into sync for fresh-DB bootstraps.
ALTER TABLE "users" ALTER COLUMN "pref_text_alerts" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clerk_image_url" text;
