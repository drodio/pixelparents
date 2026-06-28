// Apply migration 0056 (hosts.slug column) to a target DB. Additive + safe
// (ADD COLUMN IF NOT EXISTS). Run for prod with: --target=prod
//   npx tsx scripts/apply-host-slug-migration.ts --target=prod
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
  await sql.query(`ALTER TABLE "hosts" ADD COLUMN IF NOT EXISTS "slug" text`);
  const cols = await sql.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='hosts' AND column_name='slug'`,
  );
  const rows = Array.isArray(cols) ? cols : (cols as { rows: unknown[] }).rows;
  console.log(`[${target}] hosts.slug present: ${rows.length > 0}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
