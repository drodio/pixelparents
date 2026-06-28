CREATE TABLE "doc_page_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"proposed_md" text NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"source_commit" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "doc_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"emoji" text DEFAULT '' NOT NULL,
	"nav_order" integer DEFAULT 0 NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT 'seed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_type" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"clerk_user_id" text,
	"email" text,
	"subject" text DEFAULT 'Support request' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "doc_page_suggestions_slug_status_idx" ON "doc_page_suggestions" USING btree ("slug","status");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_page_suggestions_slug_commit_unique" ON "doc_page_suggestions" USING btree ("slug","source_commit");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_pages_slug_unique" ON "doc_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "support_ticket_messages_ticket_idx" ON "support_ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_eval_idx" ON "support_tickets" USING btree ("evaluation_id");--> statement-breakpoint
CREATE INDEX "support_tickets_status_updated_idx" ON "support_tickets" USING btree ("status","updated_at");