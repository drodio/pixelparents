/**
 * Idempotent, additive application of the org-badges tables. Never db:push.
 * Loads the chosen env file via dotenv and uses its non-pooled URL.
 *
 * Dev:  DOTENV_CONFIG_PATH=.env.local      npx tsx --require dotenv/config scripts/apply-org-badges-migration.ts
 * Prod: DOTENV_CONFIG_PATH=.env.prod.local npx tsx --require dotenv/config scripts/apply-org-badges-migration.ts
 *
 * The script prints the target host before writing — confirm it's the DB you
 * intend (dev = ep-old-shadow…, prod = the prod Neon endpoint) before trusting
 * the run.
 */
import { neon } from "@neondatabase/serverless";

// Prefer an explicit override, then the dev-style non-pooled var, then the
// Vercel/Neon-integration var (prod .env files populate POSTGRES_URL_NON_POOLING
// but leave DATABASE_URL_UNPOOLED empty), then the pooled URL as a last resort.
const url =
  process.env.APPLY_DB_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL;
if (!url) throw new Error("No DB URL (set APPLY_DB_URL or load an env file with DOTENV_CONFIG_PATH).");
const sql = neon(url);

async function main() {
  console.log(`Applying org-badges tables to host: ${new URL(url!).host}`);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "org_badges" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "owner_type" text NOT NULL,
      "owner_id" uuid NOT NULL,
      "label" text NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`);
  await sql.query(`CREATE INDEX IF NOT EXISTS "org_badges_owner_idx" ON "org_badges" USING btree ("owner_type","owner_id")`);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "admin_org_assignments" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "clerk_user_id" text NOT NULL,
      "owner_type" text NOT NULL,
      "owner_id" uuid NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )`);
  await sql.query(`CREATE UNIQUE INDEX IF NOT EXISTS "admin_org_assignments_unique" ON "admin_org_assignments" USING btree ("clerk_user_id","owner_type","owner_id")`);
  await sql.query(`CREATE INDEX IF NOT EXISTS "admin_org_assignments_admin_idx" ON "admin_org_assignments" USING btree ("clerk_user_id")`);
  console.log("Done.");
}
main().catch((e) => { console.error(e); process.exit(1); });
