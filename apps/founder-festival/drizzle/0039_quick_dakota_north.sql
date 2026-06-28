ALTER TABLE "event_attendees" ADD COLUMN "source" text DEFAULT 'luma' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD COLUMN "removed_by_admin" boolean DEFAULT false NOT NULL;