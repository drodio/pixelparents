// Ensure both Chief insight tables exist with the async-generation status
// columns (migration 0063). Idempotent: CREATE TABLE IF NOT EXISTS (full current
// shape) + ADD COLUMN IF NOT EXISTS for the status cols on pre-existing tables.
// For prod:  npx tsx scripts/apply-insight-status-migration.ts --target=prod
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const target = (process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "dev") as "dev" | "prod";
const file = target === "prod"
  ? "/Users/drodio/Projects/founder-festival/.env.prod.local"
  : "/Users/drodio/Projects/founder-festival/.env.local";
const env = readFileSync(file, "utf8");
const pick = (k: string) => env.match(new RegExp("^" + k + "=(.*)$", "m"))?.[1].trim().replace(/^["']|["']$/g, "") ?? "";
const url = pick("DATABASE_URL_UNPOOLED") || pick("POSTGRES_URL_NON_POOLING") || pick("DATABASE_URL") || pick("POSTGRES_URL");

async function main() {
  const sql = neon(url);
  for (const tbl of ["event_personalized_learnings", "event_recommended_connections"]) {
    await sql.query(`
      CREATE TABLE IF NOT EXISTS "${tbl}" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
        "evaluation_id" uuid NOT NULL REFERENCES "evaluations"("id") ON DELETE cascade,
        "method" text NOT NULL DEFAULT 'chief',
        "html" text NOT NULL,
        "status" text NOT NULL DEFAULT 'done',
        "chief_chat_id" text,
        "chief_message_id" text,
        "error" text,
        "generated_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    const idx = tbl === "event_personalized_learnings"
      ? "event_personalized_event_eval_unique"
      : "event_recommended_connections_event_eval_unique";
    await sql.query(`CREATE UNIQUE INDEX IF NOT EXISTS "${idx}" ON "${tbl}" USING btree ("event_id","evaluation_id")`);
    // For pre-existing tables (prod) that predate the status columns:
    await sql.query(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'done'`);
    await sql.query(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS "chief_chat_id" text`);
    await sql.query(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS "chief_message_id" text`);
    await sql.query(`ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS "error" text`);
    const cols = await sql.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='${tbl}' AND column_name IN ('status','chief_chat_id','chief_message_id','error')`,
    );
    const rows = Array.isArray(cols) ? cols : (cols as { rows: unknown[] }).rows;
    console.log(`[${target}] ${tbl}: ${rows.length}/4 status columns present`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
