-- Owner overrides for achievement badges (Profile + Leaderboard pills).
-- Idempotent so safe to re-run.
CREATE TABLE IF NOT EXISTS "badge_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"badge_id" text NOT NULL,
	"status" text NOT NULL,
	"edited_label" text,
	"original_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "badge_overrides" ADD CONSTRAINT "badge_overrides_evaluation_id_evaluations_id_fk"
        FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "badge_overrides_eval_badge_unique"
    ON "badge_overrides" USING btree ("evaluation_id","badge_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "badge_overrides_status_idx"
    ON "badge_overrides" USING btree ("status");
