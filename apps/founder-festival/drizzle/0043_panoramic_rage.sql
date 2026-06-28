CREATE TABLE "claim_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"from_email" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"score_item_id" uuid NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"request_number" serial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_messages" ADD CONSTRAINT "claim_messages_thread_id_claim_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."claim_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_threads" ADD CONSTRAINT "claim_threads_score_item_id_score_items_id_fk" FOREIGN KEY ("score_item_id") REFERENCES "public"."score_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_threads" ADD CONSTRAINT "claim_threads_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_messages_thread_idx" ON "claim_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_threads_score_item_unique" ON "claim_threads" USING btree ("score_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_threads_request_number_unique" ON "claim_threads" USING btree ("request_number");--> statement-breakpoint
ALTER SEQUENCE "claim_threads_request_number_seq" RESTART WITH 10000;