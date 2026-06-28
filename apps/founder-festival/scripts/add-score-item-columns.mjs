// Targeted migration: add the columns + table the schema now expects but
// drizzle-kit push won't apply without also dropping tables from a parallel
// branch's work. Idempotent — uses IF NOT EXISTS everywhere.
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(url);

const statements = [
  // evaluations: summary source/status/confidence + original text
  `ALTER TABLE "evaluations"
     ADD COLUMN IF NOT EXISTS "summary_source" text NOT NULL DEFAULT 'system',
     ADD COLUMN IF NOT EXISTS "summary_status" text NOT NULL DEFAULT 'likely',
     ADD COLUMN IF NOT EXISTS "summary_confidence" integer NOT NULL DEFAULT 50,
     ADD COLUMN IF NOT EXISTS "summary_original_text" text`,

  // recommendation_responses: source/status/confidence
  `ALTER TABLE "recommendation_responses"
     ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'system',
     ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'likely',
     ADD COLUMN IF NOT EXISTS "confidence" integer NOT NULL DEFAULT 50`,
  `CREATE INDEX IF NOT EXISTS "recommendation_responses_status_idx"
     ON "recommendation_responses" ("status")`,

  // score_items table
  `CREATE TABLE IF NOT EXISTS "score_items" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "evaluation_id" uuid NOT NULL REFERENCES "evaluations"("id") ON DELETE CASCADE,
     "rubric" text NOT NULL,
     "reason" text NOT NULL,
     "points" integer NOT NULL,
     "source" text NOT NULL DEFAULT 'system',
     "status" text NOT NULL DEFAULT 'likely',
     "confidence" integer NOT NULL DEFAULT 50,
     "original_reason" text,
     "original_points" integer,
     "sort_order" integer NOT NULL DEFAULT 0,
     "created_at" timestamp with time zone NOT NULL DEFAULT now(),
     "updated_at" timestamp with time zone NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS "score_items_eval_rubric_idx"
     ON "score_items" ("evaluation_id", "rubric")`,
  `CREATE INDEX IF NOT EXISTS "score_items_status_idx"
     ON "score_items" ("status")`,
];

try {
  for (const stmt of statements) {
    await sql.query(stmt);
    console.log("OK —", stmt.split("\n")[0].slice(0, 80));
  }
  console.log("\nAll migrations applied.");
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
