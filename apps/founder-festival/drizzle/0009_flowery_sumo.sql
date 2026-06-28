ALTER TABLE "scoring_job_items" DROP CONSTRAINT "scoring_job_items_evaluation_id_evaluations_id_fk";
--> statement-breakpoint
ALTER TABLE "scoring_job_items" ADD CONSTRAINT "scoring_job_items_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;