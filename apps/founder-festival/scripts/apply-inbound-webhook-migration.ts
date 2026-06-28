/**
 * Idempotent, additive application of the inbound-webhook idempotency column
 * (migration 0049): claim_messages.provider_event_id + its unique index. Never
 * db:push. Loads the chosen env file via dotenv and uses its non-pooled URL.
 *
 * Dev:  DOTENV_CONFIG_PATH=.env.local      npx tsx --require dotenv/config scripts/apply-inbound-webhook-migration.ts
 * Prod: DOTENV_CONFIG_PATH=.env.prod.local npx tsx --require dotenv/config scripts/apply-inbound-webhook-migration.ts
 *
 * The script prints the target host before writing — confirm it's the DB you
 * intend (dev = ep-old-shadow…, prod = the prod Neon endpoint) before trusting
 * the run. The unique index permits multiple NULLs, so it applies cleanly even
 * with existing rows (all of which get NULL provider_event_id).
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
  console.log(`Applying inbound-webhook idempotency column to host: ${new URL(url!).host}`);
  await sql.query(`ALTER TABLE "claim_messages" ADD COLUMN IF NOT EXISTS "provider_event_id" text`);
  await sql.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "claim_messages_provider_event_unique" ON "claim_messages" USING btree ("provider_event_id")`,
  );
  console.log("Done.");
}
main().catch((e) => { console.error(e); process.exit(1); });
