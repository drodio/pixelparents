CREATE TABLE "event_chat_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"author_eval_id" uuid NOT NULL,
	"body" text NOT NULL,
	"mentioned_eval_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"author_eval_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"visibility" text DEFAULT 'members' NOT NULL,
	"mentioned_eval_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_chat_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"voter_eval_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_chat_comments" ADD CONSTRAINT "event_chat_comments_thread_id_event_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."event_chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_chat_comments" ADD CONSTRAINT "event_chat_comments_parent_comment_id_event_chat_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."event_chat_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_chat_comments" ADD CONSTRAINT "event_chat_comments_author_eval_id_evaluations_id_fk" FOREIGN KEY ("author_eval_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_chat_threads" ADD CONSTRAINT "event_chat_threads_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_chat_threads" ADD CONSTRAINT "event_chat_threads_author_eval_id_evaluations_id_fk" FOREIGN KEY ("author_eval_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_chat_votes" ADD CONSTRAINT "event_chat_votes_voter_eval_id_evaluations_id_fk" FOREIGN KEY ("voter_eval_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_chat_comments_thread_idx" ON "event_chat_comments" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "event_chat_comments_parent_idx" ON "event_chat_comments" USING btree ("parent_comment_id");--> statement-breakpoint
CREATE INDEX "event_chat_threads_event_created_idx" ON "event_chat_threads" USING btree ("event_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "event_chat_votes_unique" ON "event_chat_votes" USING btree ("target_type","target_id","voter_eval_id");