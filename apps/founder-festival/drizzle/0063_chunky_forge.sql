ALTER TABLE "event_personalized_learnings" ADD COLUMN "status" text DEFAULT 'done' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_personalized_learnings" ADD COLUMN "chief_chat_id" text;--> statement-breakpoint
ALTER TABLE "event_personalized_learnings" ADD COLUMN "chief_message_id" text;--> statement-breakpoint
ALTER TABLE "event_personalized_learnings" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "event_recommended_connections" ADD COLUMN "status" text DEFAULT 'done' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_recommended_connections" ADD COLUMN "chief_chat_id" text;--> statement-breakpoint
ALTER TABLE "event_recommended_connections" ADD COLUMN "chief_message_id" text;--> statement-breakpoint
ALTER TABLE "event_recommended_connections" ADD COLUMN "error" text;