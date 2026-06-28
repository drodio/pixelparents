CREATE TABLE "event_applicants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"evaluation_id" uuid,
	"linkedin_url" text NOT NULL,
	"full_name" text,
	"email" text NOT NULL,
	"needs" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_reason" text,
	"admin_note" text,
	"bypass_code_id" uuid,
	"decided_by_email" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_decision_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"reason" text,
	"actor_email" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"code" text NOT NULL,
	"linkedin_url" text,
	"email" text,
	"source" text NOT NULL,
	"redeemed_by_applicant_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"host_name" text,
	"host_email" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"venue" text,
	"capacity" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"approval_mode" text DEFAULT 'manual' NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sponsor" jsonb,
	"description" text,
	"created_by_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bypass_codes" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "investor_stage_focus" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "event_applicants" ADD CONSTRAINT "event_applicants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_applicants" ADD CONSTRAINT "event_applicants_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_applicants" ADD CONSTRAINT "event_applicants_bypass_code_id_bypass_codes_id_fk" FOREIGN KEY ("bypass_code_id") REFERENCES "public"."bypass_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_decision_log" ADD CONSTRAINT "event_decision_log_applicant_id_event_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."event_applicants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invites" ADD CONSTRAINT "event_invites_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invites" ADD CONSTRAINT "event_invites_redeemed_by_applicant_id_event_applicants_id_fk" FOREIGN KEY ("redeemed_by_applicant_id") REFERENCES "public"."event_applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_applicants_event_linkedin_unique" ON "event_applicants" USING btree ("event_id","linkedin_url");--> statement-breakpoint
CREATE INDEX "event_applicants_status_idx" ON "event_applicants" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "event_decision_log_applicant_idx" ON "event_decision_log" USING btree ("applicant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_invites_code_unique" ON "event_invites" USING btree ("code");--> statement-breakpoint
CREATE INDEX "event_invites_event_idx" ON "event_invites" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_unique" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
ALTER TABLE "bypass_codes" ADD CONSTRAINT "bypass_codes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;