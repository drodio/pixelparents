CREATE TABLE "scoring_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"founder_score" integer NOT NULL,
	"investor_score" integer NOT NULL,
	"score" integer NOT NULL,
	"signal_quality" text NOT NULL,
	"company_stage" text,
	"source" text NOT NULL,
	"source_code" text,
	"model" text,
	"cost_total_cents" integer,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scoring_runs" ADD CONSTRAINT "scoring_runs_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scoring_runs_eval_created_idx" ON "scoring_runs" USING btree ("evaluation_id","created_at" DESC NULLS LAST);