CREATE TABLE "connection_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"group" text NOT NULL,
	"action" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connection_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"from_evaluation_id" uuid NOT NULL,
	"to_evaluation_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "event_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"evaluation_id" uuid,
	"luma_guest_api_id" text NOT NULL,
	"luma_user_api_id" text,
	"email" text,
	"name" text,
	"approval_status" text DEFAULT 'pending' NOT NULL,
	"registered_at" timestamp with time zone,
	"checked_in_at" timestamp with time zone,
	"luma_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_contact_sharing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"mode" text DEFAULT 'by_request' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"blob_url" text NOT NULL,
	"source" text DEFAULT 'admin' NOT NULL,
	"uploaded_by_evaluation_id" uuid,
	"visibility" text DEFAULT 'public' NOT NULL,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_priorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"text" text NOT NULL,
	"category" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"sponsor_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"blurb" text,
	"icon_url" text,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sponsor_id" uuid NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"blurb" text,
	"logo_url" text,
	"website_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "learnings_public" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "learnings_attendees" text;--> statement-breakpoint
ALTER TABLE "connection_preferences" ADD CONSTRAINT "connection_preferences_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_from_evaluation_id_evaluations_id_fk" FOREIGN KEY ("from_evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_to_evaluation_id_evaluations_id_fk" FOREIGN KEY ("to_evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_contact_sharing" ADD CONSTRAINT "event_contact_sharing_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_contact_sharing" ADD CONSTRAINT "event_contact_sharing_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_hosts" ADD CONSTRAINT "event_hosts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_hosts" ADD CONSTRAINT "event_hosts_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_uploaded_by_evaluation_id_evaluations_id_fk" FOREIGN KEY ("uploaded_by_evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_priorities" ADD CONSTRAINT "event_priorities_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsors" ADD CONSTRAINT "event_sponsors_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsors" ADD CONSTRAINT "event_sponsors_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_profiles" ADD CONSTRAINT "host_profiles_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_profiles" ADD CONSTRAINT "host_profiles_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_profiles" ADD CONSTRAINT "sponsor_profiles_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_profiles" ADD CONSTRAINT "sponsor_profiles_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connection_preferences_unique" ON "connection_preferences" USING btree ("evaluation_id","scope","group");--> statement-breakpoint
CREATE INDEX "connection_preferences_eval_idx" ON "connection_preferences" USING btree ("evaluation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_requests_pair_unique" ON "connection_requests" USING btree ("event_id","from_evaluation_id","to_evaluation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_requests_token_unique" ON "connection_requests" USING btree ("token");--> statement-breakpoint
CREATE INDEX "connection_requests_to_idx" ON "connection_requests" USING btree ("to_evaluation_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendees_event_guest_unique" ON "event_attendees" USING btree ("event_id","luma_guest_api_id");--> statement-breakpoint
CREATE INDEX "event_attendees_event_idx" ON "event_attendees" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_attendees_evaluation_idx" ON "event_attendees" USING btree ("evaluation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_contact_sharing_unique" ON "event_contact_sharing" USING btree ("event_id","evaluation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_hosts_event_host_unique" ON "event_hosts" USING btree ("event_id","host_id");--> statement-breakpoint
CREATE INDEX "event_hosts_event_idx" ON "event_hosts" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_hosts_host_idx" ON "event_hosts" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "event_photos_event_idx" ON "event_photos" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE INDEX "event_priorities_event_idx" ON "event_priorities" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "event_sponsors_event_sponsor_unique" ON "event_sponsors" USING btree ("event_id","sponsor_id");--> statement-breakpoint
CREATE INDEX "event_sponsors_event_idx" ON "event_sponsors" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_sponsors_sponsor_idx" ON "event_sponsors" USING btree ("sponsor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "host_profiles_host_eval_unique" ON "host_profiles" USING btree ("host_id","evaluation_id");--> statement-breakpoint
CREATE INDEX "host_profiles_host_idx" ON "host_profiles" USING btree ("host_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_profiles_sponsor_eval_unique" ON "sponsor_profiles" USING btree ("sponsor_id","evaluation_id");--> statement-breakpoint
CREATE INDEX "sponsor_profiles_sponsor_idx" ON "sponsor_profiles" USING btree ("sponsor_id");