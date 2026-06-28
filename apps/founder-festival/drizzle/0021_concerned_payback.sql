CREATE TABLE "recommendation_visibility" (
	"evaluation_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_visibility_evaluation_id_item_id_pk" PRIMARY KEY("evaluation_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "recommendation_visibility" ADD CONSTRAINT "recommendation_visibility_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;