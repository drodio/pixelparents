CREATE TABLE "admin_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text,
	"name" text,
	"image_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_email" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "admin_access_clerk_user_id_unique" ON "admin_access" USING btree ("clerk_user_id");