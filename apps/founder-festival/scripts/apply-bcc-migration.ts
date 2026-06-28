// Apply migration 0065 (message_campaigns.bcc_address) to a target DB. Additive,
// safe, idempotent (ADD COLUMN … IF NOT EXISTS), so it can be re-run and never
// drops or rewrites anything. For prod: --target=prod
//   npx tsx scripts/apply-bcc-migration.ts --target=prod
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const target = (process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "dev") as "dev" | "prod";
// Resolve env files relative to where the script is run (repo root), so it's
// portable across operators/CI rather than tied to one machine's home dir.
const file = resolve(process.cwd(), target === "prod" ? ".env.prod.local" : ".env.local");
const env = readFileSync(file, "utf8");
const pick = (k: string) => env.match(new RegExp("^" + k + "=(.*)$", "m"))?.[1].trim().replace(/^["']|["']$/g, "") ?? "";
const url = pick("DATABASE_URL_UNPOOLED") || pick("POSTGRES_URL_NON_POOLING") || pick("DATABASE_URL") || pick("POSTGRES_URL");

const STATEMENTS = [
  `ALTER TABLE "message_campaigns" ADD COLUMN IF NOT EXISTS "bcc_address" text`,
];

async function main() {
  const sql = neon(url);
  const host = url.match(/@([^/]+)\//)?.[1] ?? "?";
  console.log(`[${target}] applying to ${host}`);
  for (const stmt of STATEMENTS) await sql.query(stmt);

  // Verify.
  const cols = await sql.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='message_campaigns' AND column_name='bcc_address'`,
  );
  const crows = Array.isArray(cols) ? cols : (cols as { rows: unknown[] }).rows;
  console.log(`[${target}] message_campaigns.bcc_address: ${crows.length === 1 ? "OK" : "MISSING"}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
