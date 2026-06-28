ALTER TABLE "evaluations" ADD COLUMN "found_email" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "found_email_status" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "found_email_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "found_email_by" text;