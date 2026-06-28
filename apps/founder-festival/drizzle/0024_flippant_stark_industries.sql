ALTER TABLE "evaluations" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "hidden_by_clerk_user_id" text;--> statement-breakpoint
CREATE INDEX "evaluations_hidden_at_idx" ON "evaluations" USING btree ("hidden_at");