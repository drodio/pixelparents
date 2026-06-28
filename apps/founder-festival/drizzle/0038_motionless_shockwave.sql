CREATE TABLE "family_member_viewers" (
	"family_member_id" uuid NOT NULL,
	"viewer_evaluation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_member_viewers_family_member_id_viewer_evaluation_id_pk" PRIMARY KEY("family_member_id","viewer_evaluation_id")
);
--> statement-breakpoint
CREATE TABLE "family_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"relationship" text NOT NULL,
	"relationship_other" text,
	"first_name" text NOT NULL,
	"last_name" text,
	"birthdate" date,
	"interests" text[] DEFAULT '{}'::text[] NOT NULL,
	"photo_url" text,
	"visibility" text DEFAULT 'specific' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "family_member_viewers" ADD CONSTRAINT "family_member_viewers_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_member_viewers" ADD CONSTRAINT "family_member_viewers_viewer_evaluation_id_evaluations_id_fk" FOREIGN KEY ("viewer_evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_member_viewers_viewer_idx" ON "family_member_viewers" USING btree ("viewer_evaluation_id");--> statement-breakpoint
CREATE INDEX "family_members_evaluation_id_idx" ON "family_members" USING btree ("evaluation_id");