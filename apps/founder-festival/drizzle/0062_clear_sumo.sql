CREATE TABLE "profile_dossiers" (
	"evaluation_id" uuid PRIMARY KEY NOT NULL,
	"chat_id" text,
	"message_id" text,
	"share_url" text,
	"status" text DEFAULT 'ready' NOT NULL,
	"total_credits" integer,
	"model" text,
	"intelligence" text,
	"raw_markdown" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_dossiers" ADD CONSTRAINT "profile_dossiers_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;