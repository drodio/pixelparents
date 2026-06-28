CREATE TABLE "credit_balances" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"delta_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"evaluation_id" uuid,
	"stripe_payment_intent_id" text,
	"balance_after_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "credit_ledger_clerk_user_id_idx" ON "credit_ledger" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_payment_intent_unique" ON "credit_ledger" USING btree ("stripe_payment_intent_id");