// Apply migration 0059 (events.location column) to a target DB. Additive + safe
// (ADD COLUMN IF NOT EXISTS). For prod: --target=prod
//   npx tsx scripts/apply-event-location-migration.ts --target=prod
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
  await sql.query(`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "location" text`);
  const cols = await sql.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='events' AND column_name='location'`,
  );
  const rows = Array.isArray(cols) ? cols : (cols as { rows: unknown[] }).rows;
  console.log(`[${target}] events.location present: ${rows.length > 0}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
