-- Per-item rows for founder/investor breakdowns + owner-driven status.
CREATE TABLE IF NOT EXISTS "score_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"rubric" text NOT NULL,
	"reason" text NOT NULL,
	"points" integer NOT NULL,
	"source" text DEFAULT 'system' NOT NULL,
	"status" text DEFAULT 'likely' NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"original_reason" text,
	"original_points" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- "What you likely need" paragraph gets the same source/status/confidence
-- treatment as individual breakdown items.
ALTER TABLE "evaluations" ADD COLUMN IF NOT EXISTS "summary_source" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN IF NOT EXISTS "summary_status" text DEFAULT 'likely' NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN IF NOT EXISTS "summary_confidence" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN IF NOT EXISTS "summary_original_text" text;--> statement-breakpoint

-- Recommendation responses now carry source/status/confidence too so the
-- same admin pending-queue logic can include priorities.
ALTER TABLE "recommendation_responses" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendation_responses" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'likely' NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendation_responses" ADD COLUMN IF NOT EXISTS "confidence" integer DEFAULT 50 NOT NULL;--> statement-breakpoint

-- Foreign keys + indexes.
DO $$ BEGIN
    ALTER TABLE "score_items" ADD CONSTRAINT "score_items_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "score_items_eval_rubric_idx" ON "score_items" USING btree ("evaluation_id","rubric");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "score_items_status_idx" ON "score_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recommendation_responses_status_idx" ON "recommendation_responses" USING btree ("status");
