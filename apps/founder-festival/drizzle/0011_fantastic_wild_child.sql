ALTER TABLE "evaluations" ADD COLUMN "request_ip" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "request_city" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "request_region" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "request_country" text;--> statement-breakpoint
CREATE INDEX "evaluations_request_ip_idx" ON "evaluations" USING btree ("request_ip");