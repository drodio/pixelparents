CREATE TABLE "bypass_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"max_uses" integer NOT NULL,
	"uses_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"assigned_score" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"linkedin_url" text NOT NULL,
	"full_name" text,
	"score" integer NOT NULL,
	"founder_score" integer DEFAULT 0 NOT NULL,
	"investor_score" integer DEFAULT 0 NOT NULL,
	"signal_quality" text NOT NULL,
	"breakdown" jsonb,
	"profile" jsonb,
	"company_stage" text,
	"recommendations" jsonb,
	"exa_grounding" jsonb,
	"pricing" jsonb DEFAULT '{}'::jsonb,
	"source" text NOT NULL,
	"source_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "majestic_million" (
	"rank" integer PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"ip" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_ip_day_pk" PRIMARY KEY("ip","day")
);
--> statement-breakpoint
CREATE TABLE "recommendation_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"rating" integer NOT NULL,
	"category" text,
	"edited_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"evaluation_id" uuid,
	"verified_at" timestamp with time zone,
	"verified_via" text,
	"match_confidence" text,
	"verified_signal" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recommendation_responses" ADD CONSTRAINT "recommendation_responses_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bypass_codes_code_lower_unique" ON "bypass_codes" USING btree (lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "evaluations_linkedin_url_unique" ON "evaluations" USING btree ("linkedin_url");--> statement-breakpoint
CREATE INDEX "evaluations_source_code_idx" ON "evaluations" USING btree ("source_code");--> statement-breakpoint
CREATE INDEX "majestic_million_domain_idx" ON "majestic_million" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_responses_eval_item_unique" ON "recommendation_responses" USING btree ("evaluation_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_user_id_unique" ON "users" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "users_evaluation_id_idx" ON "users" USING btree ("evaluation_id");