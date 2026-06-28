ALTER TABLE "admin_roles" ADD COLUMN "users_scope" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD COLUMN "events_scope" text DEFAULT 'all' NOT NULL;