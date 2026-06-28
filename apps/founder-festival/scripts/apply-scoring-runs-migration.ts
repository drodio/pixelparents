/**
 * Idempotent, additive application of the `scoring_runs` table.
 *
 * Per PRD/vercel-neon deploy gotchas: NEVER `db:push` from a checkout (it makes
 * the DB match the checkout exactly and can drop columns). Instead apply additive
 * DDL with `IF NOT EXISTS` via a one-off script. Targets DATABASE_URL_UNPOOLED
 * (dev = ep-old-shadow in this repo's .env.local). Run from the worktree:
 *
 *   npx tsx --require dotenv/config scripts/apply-scoring-runs-migration.ts
 *
 * To apply to prod at deploy time, run with the prod unpooled URL explicitly:
 *   APPLY_DB_URL="$POSTGRES_URL_NON_POOLING" npx tsx ... (operator-confirmed only)
 */
import { neon } from "@neondatabase/serverless";

const url =
  process.env.APPLY_DB_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL;
if (!url) {
  throw new Error("No DB URL (set DATABASE_URL_UNPOOLED or APPLY_DB_URL).");
}

const host = new URL(url).host;
const sql = neon(url);

async function main() {
  console.log(`Applying scoring_runs to host: ${host}`);
  const [{ count }] = (await sql.query(
    `select count(*)::int as count from evaluations`,
  )) as Array<{ count: number }>;
  console.log(`evaluations row count: ${count}`);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS "scoring_runs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "evaluation_id" uuid NOT NULL REFERENCES "public"."evaluations"("id") ON DELETE CASCADE,
      "founder_score" integer NOT NULL,
      "investor_score" integer NOT NULL,
      "score" integer NOT NULL,
      "signal_quality" text NOT NULL,
      "company_stage" text,
      "source" text NOT NULL,
      "source_code" text,
      "model" text,
      "cost_total_cents" integer,
      "snapshot" jsonb NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  console.log("• scoring_runs table ready");

  await sql.query(`
    CREATE INDEX IF NOT EXISTS "scoring_runs_eval_created_idx"
      ON "scoring_runs" USING btree ("evaluation_id", "created_at" DESC NULLS LAST)
  `);
  console.log("• scoring_runs_eval_created_idx ready");

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
