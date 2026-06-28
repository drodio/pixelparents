CREATE TABLE "admin_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"scope" text DEFAULT 'edit_all' NOT NULL,
	"grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_access" ADD COLUMN "role_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_roles_name_unique" ON "admin_roles" USING btree ("name");--> statement-breakpoint
ALTER TABLE "admin_access" ADD CONSTRAINT "admin_access_role_id_admin_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE no action ON UPDATE no action;