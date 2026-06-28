/**
 * Idempotent, additive application of migration 0064: adds
 * `buyer_clerk_user_id` + `error` to `profile_dossiers`. Never db:push.
 * Loads the chosen env file via dotenv and uses its non-pooled URL.
 *
 * Dev:  DOTENV_CONFIG_PATH=.env.local      npx tsx --require dotenv/config scripts/apply-dossier-columns.ts
 * Prod: DOTENV_CONFIG_PATH=.env.prod.local npx tsx --require dotenv/config scripts/apply-dossier-columns.ts
 *
 * The script prints the target host before writing — confirm it's the DB you
 * intend (dev = ep-old-shadow…, prod = the prod Neon endpoint) before trusting
 * the run. Safe to re-run (ADD COLUMN IF NOT EXISTS).
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
  console.log(`Applying dossier columns to host: ${new URL(url!).host}`);
  await sql.query(`ALTER TABLE "profile_dossiers" ADD COLUMN IF NOT EXISTS "buyer_clerk_user_id" text`);
  await sql.query(`ALTER TABLE "profile_dossiers" ADD COLUMN IF NOT EXISTS "error" text`);
  console.log("Done.");
}
main().catch((e) => { console.error(e); process.exit(1); });
