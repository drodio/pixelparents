CREATE TABLE "member_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid,
	"clerk_user_id" text,
	"to_evaluation_id" uuid,
	"to_email" text NOT NULL,
	"from_address" text NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"event_id" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"created_by_clerk_user_id" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"from_address" text NOT NULL,
	"subject_template" text NOT NULL,
	"body_template" text NOT NULL,
	"signature_text" text,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pref_email_event_logistics" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pref_text_event_logistics" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "member_messages" ADD CONSTRAINT "member_messages_campaign_id_message_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."message_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_messages" ADD CONSTRAINT "member_messages_to_evaluation_id_evaluations_id_fk" FOREIGN KEY ("to_evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_messages" ADD CONSTRAINT "member_messages_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_campaigns" ADD CONSTRAINT "message_campaigns_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_messages_user_sent_idx" ON "member_messages" USING btree ("clerk_user_id","sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "member_messages_eval_sent_idx" ON "member_messages" USING btree ("to_evaluation_id","sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "member_messages_campaign_idx" ON "member_messages" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "message_campaigns_event_created_idx" ON "message_campaigns" USING btree ("event_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "message_campaigns_status_scheduled_idx" ON "message_campaigns" USING btree ("status","scheduled_for");