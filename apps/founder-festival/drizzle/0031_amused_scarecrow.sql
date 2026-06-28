ALTER TABLE "evaluations" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "scoring_job_items" ADD COLUMN "input_phone" text;--> statement-breakpoint
ALTER TABLE "scoring_job_items" ADD COLUMN "input_job_title" text;