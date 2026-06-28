CREATE TABLE "admin_org_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "admin_org_assignments_unique" ON "admin_org_assignments" USING btree ("clerk_user_id","owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "admin_org_assignments_admin_idx" ON "admin_org_assignments" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "org_badges_owner_idx" ON "org_badges" USING btree ("owner_type","owner_id");