CREATE TABLE "event_personalized_learnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"method" text DEFAULT 'chief' NOT NULL,
	"html" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_personalized_learnings" ADD CONSTRAINT "event_personalized_learnings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_personalized_learnings" ADD CONSTRAINT "event_personalized_learnings_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_personalized_event_eval_unique" ON "event_personalized_learnings" USING btree ("event_id","evaluation_id");