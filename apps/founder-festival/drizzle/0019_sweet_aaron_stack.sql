ALTER TABLE "events" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "luma_event_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "luma_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cover_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "events_luma_event_id_unique" ON "events" USING btree ("luma_event_id");