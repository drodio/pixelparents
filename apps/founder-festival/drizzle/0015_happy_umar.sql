ALTER TABLE "scoring_job_items" ADD COLUMN "founder_score" integer;--> statement-breakpoint
ALTER TABLE "scoring_job_items" ADD COLUMN "investor_score" integer;--> statement-breakpoint
ALTER TABLE "scoring_job_items" ADD COLUMN "combined_score" integer;--> statement-breakpoint
ALTER TABLE "scoring_job_items" ADD COLUMN "cost_cents" integer;--> statement-breakpoint
ALTER TABLE "scoring_jobs" ADD COLUMN "rerun_of_job_id" uuid;--> statement-breakpoint
ALTER TABLE "scoring_jobs" ADD CONSTRAINT "scoring_jobs_rerun_of_job_id_scoring_jobs_id_fk" FOREIGN KEY ("rerun_of_job_id") REFERENCES "public"."scoring_jobs"("id") ON DELETE set null ON UPDATE no action;