// Apply migration 0061 (event_recommended_connections table) to a target DB.
// Additive + idempotent (CREATE TABLE / INDEX IF NOT EXISTS). For prod:
//   npx tsx scripts/apply-recommended-connections-migration.ts --target=prod
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
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "event_recommended_connections" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
      "evaluation_id" uuid NOT NULL REFERENCES "evaluations"("id") ON DELETE cascade,
      "method" text DEFAULT 'chief' NOT NULL,
      "html" text NOT NULL,
      "generated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`);
  await sql.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "event_recommended_connections_event_eval_unique"
       ON "event_recommended_connections" USING btree ("event_id","evaluation_id")`,
  );
  const cols = await sql.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name='event_recommended_connections'`,
  );
  const rows = Array.isArray(cols) ? cols : (cols as { rows: unknown[] }).rows;
  console.log(`[${target}] event_recommended_connections present: ${rows.length > 0}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
