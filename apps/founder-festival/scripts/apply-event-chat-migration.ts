/**
 * Idempotent, additive application of the event-chat tables (threads, comments,
 * votes). Per the pnpm/Neon deploy gotchas: NEVER db:push — apply additive DDL
 * with IF NOT EXISTS. Targets DATABASE_URL_UNPOOLED (dev) by default.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx --require dotenv/config scripts/apply-event-chat-migration.ts
 *   # prod (operator-confirmed): APPLY_DB_URL="$POSTGRES_URL_NON_POOLING" npx tsx ...
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.APPLY_DB_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("No DB URL (set DATABASE_URL_UNPOOLED or APPLY_DB_URL).");
const sql = neon(url);

async function main() {
  console.log(`Applying event-chat tables to host: ${new URL(url!).host}`);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS "event_chat_threads" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "event_id" uuid NOT NULL REFERENCES "public"."events"("id") ON DELETE CASCADE,
      "author_eval_id" uuid NOT NULL REFERENCES "public"."evaluations"("id") ON DELETE CASCADE,
      "title" text NOT NULL,
      "body" text NOT NULL,
      "visibility" text NOT NULL DEFAULT 'members',
      "mentioned_eval_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "event_chat_comments" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "thread_id" uuid NOT NULL REFERENCES "public"."event_chat_threads"("id") ON DELETE CASCADE,
      "parent_comment_id" uuid REFERENCES "public"."event_chat_comments"("id") ON DELETE CASCADE,
      "author_eval_id" uuid NOT NULL REFERENCES "public"."evaluations"("id") ON DELETE CASCADE,
      "body" text NOT NULL,
      "mentioned_eval_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "event_chat_votes" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "target_type" text NOT NULL,
      "target_id" uuid NOT NULL,
      "voter_eval_id" uuid NOT NULL REFERENCES "public"."evaluations"("id") ON DELETE CASCADE,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )`);

  await sql.query(`CREATE INDEX IF NOT EXISTS "event_chat_comments_thread_idx" ON "event_chat_comments" USING btree ("thread_id","created_at")`);
  await sql.query(`CREATE INDEX IF NOT EXISTS "event_chat_comments_parent_idx" ON "event_chat_comments" USING btree ("parent_comment_id")`);
  await sql.query(`CREATE INDEX IF NOT EXISTS "event_chat_threads_event_created_idx" ON "event_chat_threads" USING btree ("event_id","created_at" DESC NULLS LAST)`);
  await sql.query(`CREATE UNIQUE INDEX IF NOT EXISTS "event_chat_votes_unique" ON "event_chat_votes" USING btree ("target_type","target_id","voter_eval_id")`);

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
