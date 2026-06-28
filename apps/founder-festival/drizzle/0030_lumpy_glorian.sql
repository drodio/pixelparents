CREATE TABLE "profile_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"email" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" text
);
--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "subject_city" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "subject_region" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "subject_country" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "subject_location_raw" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "subject_location_source" text;--> statement-breakpoint
ALTER TABLE "scoring_job_items" ADD COLUMN "input_email" text;--> statement-breakpoint
ALTER TABLE "scoring_job_items" ADD COLUMN "input_city" text;--> statement-breakpoint
ALTER TABLE "scoring_job_items" ADD COLUMN "input_region" text;--> statement-breakpoint
ALTER TABLE "scoring_job_items" ADD COLUMN "input_country" text;--> statement-breakpoint
ALTER TABLE "scoring_job_items" ADD COLUMN "input_location_raw" text;--> statement-breakpoint
ALTER TABLE "profile_emails" ADD CONSTRAINT "profile_emails_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_emails_eval_email_unique" ON "profile_emails" USING btree ("evaluation_id","email");--> statement-breakpoint
CREATE INDEX "profile_emails_evaluation_id_idx" ON "profile_emails" USING btree ("evaluation_id");