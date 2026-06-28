CREATE TABLE "endorsement_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endorsement_id" uuid NOT NULL,
	"from_evaluation_id" uuid NOT NULL,
	"from_clerk_user_id" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "endorsement_contributions" ADD CONSTRAINT "endorsement_contributions_endorsement_id_endorsements_id_fk" FOREIGN KEY ("endorsement_id") REFERENCES "public"."endorsements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsement_contributions" ADD CONSTRAINT "endorsement_contributions_from_evaluation_id_evaluations_id_fk" FOREIGN KEY ("from_evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "endorsement_contributions_endorsement_id_idx" ON "endorsement_contributions" USING btree ("endorsement_id");--> statement-breakpoint
CREATE INDEX "endorsement_contributions_from_evaluation_id_idx" ON "endorsement_contributions" USING btree ("from_evaluation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "endorsement_contributions_unique" ON "endorsement_contributions" USING btree ("endorsement_id","from_evaluation_id");