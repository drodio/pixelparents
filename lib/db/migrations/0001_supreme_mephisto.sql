-- Co-parent invites + shared family.
--
-- HAND-EDITED (do not regenerate): drizzle-kit's auto diff bundled unrelated
-- drift (tables/columns already applied to prod via db:push), which would fail
-- on live data. This migration is rewritten to do ONLY the families change, and
-- to BACKFILL existing rows before enforcing NOT NULL so it is safe on prod.
-- Apply this on deploy. Every statement is idempotent (safe to re-run).

-- 1. families table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invite_token" text NOT NULL,
	CONSTRAINT "families_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint

-- 2. add family_id as NULLABLE first (so the backfill can populate it) --------
ALTER TABLE "signups" ADD COLUMN IF NOT EXISTS "family_id" uuid;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN IF NOT EXISTS "family_id" uuid;--> statement-breakpoint

-- 3a. backfill: one new family (with a unique invite token) per existing signup,
--     linking that signup to its family. The token is a 64-char hex string built
--     from two random UUIDs — hard to guess and needs no extra extension.
DO $$
DECLARE
	s RECORD;
	fid uuid;
BEGIN
	FOR s IN SELECT "id" FROM "signups" WHERE "family_id" IS NULL LOOP
		INSERT INTO "families" ("invite_token")
			VALUES (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
			RETURNING "id" INTO fid;
		UPDATE "signups" SET "family_id" = fid WHERE "id" = s."id";
	END LOOP;
END $$;
--> statement-breakpoint

-- 3b. backfill: each child inherits its (originating) parent's family --------
UPDATE "children" AS c
	SET "family_id" = s."family_id"
	FROM "signups" AS s
	WHERE c."signup_id" = s."id" AND c."family_id" IS NULL;
--> statement-breakpoint

-- 4. now that every row has a family_id, enforce NOT NULL + add the FKs -------
ALTER TABLE "signups" ALTER COLUMN "family_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "children" ALTER COLUMN "family_id" SET NOT NULL;--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'signups_family_id_families_id_fk'
	) THEN
		ALTER TABLE "signups" ADD CONSTRAINT "signups_family_id_families_id_fk"
			FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'children_family_id_families_id_fk'
	) THEN
		ALTER TABLE "children" ADD CONSTRAINT "children_family_id_families_id_fk"
			FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;
