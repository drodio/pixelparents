ALTER TABLE "evaluations" ADD COLUMN "cost_llm_cents" integer;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "cost_exa_cents" integer;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "cost_total_cents" integer;