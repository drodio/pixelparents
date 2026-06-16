CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signup_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_name" text NOT NULL,
	"grade" text,
	"interests" text[],
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"github_username" text NOT NULL,
	"ohs_affiliation" text,
	"technical_depth" text,
	"linkedin_url" text,
	"skillsets" text[],
	"time_commitment" text,
	"city" text,
	"state" text,
	"parent_interests" text[],
	"photos" jsonb DEFAULT '[]'::jsonb,
	"extra" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_signup_id_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."signups"("id") ON DELETE cascade ON UPDATE no action;