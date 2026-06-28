ALTER TABLE "evaluations" ADD COLUMN "investor_industry_focus" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "investor_leads_rounds" boolean;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "investor_check_size" jsonb;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "on_neo" boolean;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "neo_slug" text;