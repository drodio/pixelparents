CREATE TABLE "profile_slug_aliases" (
	"alias_slug" text PRIMARY KEY NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "evaluations_slug_kind_slug_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "profile_slug_aliases" ADD CONSTRAINT "profile_slug_aliases_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_slug_aliases_evaluation_id_idx" ON "profile_slug_aliases" USING btree ("evaluation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluations_slug_unique" ON "evaluations" USING btree ("slug");