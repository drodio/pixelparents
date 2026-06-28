CREATE TABLE "endorsements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"from_evaluation_id" uuid NOT NULL,
	"from_clerk_user_id" text NOT NULL,
	"body" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"points_visibility" text DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_from_evaluation_id_evaluations_id_fk" FOREIGN KEY ("from_evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "endorsements_evaluation_id_idx" ON "endorsements" USING btree ("evaluation_id");--> statement-breakpoint
CREATE INDEX "endorsements_from_evaluation_id_idx" ON "endorsements" USING btree ("from_evaluation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "endorsements_from_to_unique" ON "endorsements" USING btree ("from_evaluation_id","evaluation_id");