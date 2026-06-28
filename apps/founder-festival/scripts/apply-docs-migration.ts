/**
 * Idempotent, additive application of the /docs tables. Never db:push.
 * Loads the chosen env file via dotenv and uses its non-pooled URL.
 *
 * Dev:  DOTENV_CONFIG_PATH=.env.local      npx tsx --require dotenv/config scripts/apply-docs-migration.ts
 * Prod: DOTENV_CONFIG_PATH=.env.prod.local npx tsx --require dotenv/config scripts/apply-docs-migration.ts
 *
 * Prints the target host before writing — confirm it's the DB you intend
 * (dev = ep-old-shadow…, prod = the prod Neon endpoint) before trusting the run.
 */
import { neon } from "@neondatabase/serverless";

const url =
  process.env.APPLY_DB_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL;
if (!url) throw new Error("No DB URL (set APPLY_DB_URL or load an env file with DOTENV_CONFIG_PATH).");
const sql = neon(url);

async function main() {
  console.log(`Applying /docs tables to host: ${new URL(url!).host}`);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS "doc_pages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "slug" text NOT NULL,
      "title" text NOT NULL,
      "emoji" text DEFAULT '' NOT NULL,
      "nav_order" integer DEFAULT 0 NOT NULL,
      "body_md" text DEFAULT '' NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_by" text DEFAULT 'seed' NOT NULL
    )`);
  await sql.query(`CREATE UNIQUE INDEX IF NOT EXISTS "doc_pages_slug_unique" ON "doc_pages" USING btree ("slug")`);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS "doc_page_suggestions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "slug" text NOT NULL,
      "proposed_md" text NOT NULL,
      "rationale" text DEFAULT '' NOT NULL,
      "source_commit" text NOT NULL,
      "status" text DEFAULT 'pending' NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "resolved_at" timestamp with time zone
    )`);
  await sql.query(`CREATE INDEX IF NOT EXISTS "doc_page_suggestions_slug_status_idx" ON "doc_page_suggestions" USING btree ("slug","status")`);
  await sql.query(`CREATE UNIQUE INDEX IF NOT EXISTS "doc_page_suggestions_slug_commit_unique" ON "doc_page_suggestions" USING btree ("slug","source_commit")`);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS "support_tickets" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "evaluation_id" uuid NOT NULL,
      "clerk_user_id" text,
      "email" text,
      "subject" text DEFAULT 'Support request' NOT NULL,
      "status" text DEFAULT 'open' NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`);
  await sql.query(`CREATE INDEX IF NOT EXISTS "support_tickets_eval_idx" ON "support_tickets" USING btree ("evaluation_id")`);
  await sql.query(`CREATE INDEX IF NOT EXISTS "support_tickets_status_updated_idx" ON "support_tickets" USING btree ("status","updated_at")`);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS "support_ticket_messages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "ticket_id" uuid NOT NULL,
      "author_type" text NOT NULL,
      "body" text NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )`);
  await sql.query(`CREATE INDEX IF NOT EXISTS "support_ticket_messages_ticket_idx" ON "support_ticket_messages" USING btree ("ticket_id","created_at")`);

  console.log("Done.");
}
main().catch((e) => { console.error(e); process.exit(1); });
