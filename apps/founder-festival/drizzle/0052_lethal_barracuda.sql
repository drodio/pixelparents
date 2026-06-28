CREATE TABLE "event_badge_links" (
	"event_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL,
	CONSTRAINT "event_badge_links_event_id_badge_id_pk" PRIMARY KEY("event_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "event_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_badge_links" ADD CONSTRAINT "event_badge_links_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_badge_links" ADD CONSTRAINT "event_badge_links_badge_id_event_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."event_badges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_badge_links_badge_idx" ON "event_badge_links" USING btree ("badge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_badges_slug_unique" ON "event_badges" USING btree ("slug");