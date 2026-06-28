ALTER TABLE "evaluations" ADD COLUMN "find_email_queued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "find_email_queued_by" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "find_email_billable" boolean;