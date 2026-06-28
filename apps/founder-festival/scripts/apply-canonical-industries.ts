// Apply migration 0036 (canonical_industries column) + backfill existing rows
// from investor_industry_focus, to a target DB. Run with `dev` or `prod`:
//   npx tsx scripts/apply-canonical-industries.ts dev
//   npx tsx scripts/apply-canonical-industries.ts prod
// Loads .env.local itself (so no env-var prefix is needed — keeps the command,
// and the Bash permission rule that allows it, clean). Migrations apply to prod
// manually (no auto-migrate on deploy) — this IS that manual step, idempotent via
// ADD COLUMN IF NOT EXISTS. Founder industries populate on the next rescore (the
// new `industries` scorer field); this backfill gives existing INVESTOR rows
// their industries immediately.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { canonicalizeIndustries } from "../src/lib/industries";

const target = process.argv[2];
if (target !== "dev" && target !== "prod") throw new Error("usage: ... <dev|prod>");
const conn = target === "prod" ? process.env.POSTGRES_URL_NON_POOLING : process.env.DATABASE_URL;
if (!conn) throw new Error(`no connection string for ${target}`);
const host = conn.match(/ep-[a-z-]+/)?.[0] ?? "?";
if (target === "prod" && !/ep-fragrant-surf/.test(conn)) throw new Error(`prod target but host is ${host}`);
const sql = neon(conn);

async function main() {
  console.log(`target=${target} host=${host}`);
  // 1. Add the column (idempotent).
  await sql`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS canonical_industries text[] DEFAULT '{}'::text[] NOT NULL`;
  console.log("column ensured.");
  // 2. Backfill from investor_industry_focus (jsonb string[]).
  const rows = (await sql`SELECT id, investor_industry_focus FROM evaluations`) as Array<{
    id: string;
    investor_industry_focus: unknown;
  }>;
  let updated = 0;
  for (const r of rows) {
    const inv = Array.isArray(r.investor_industry_focus) ? (r.investor_industry_focus as string[]) : [];
    const canon = canonicalizeIndustries(inv);
    if (canon.length > 0) {
      await sql`UPDATE evaluations SET canonical_industries = ${canon}::text[] WHERE id = ${r.id}`;
      updated++;
    }
  }
  console.log(`backfill done: ${rows.length} rows scanned, ${updated} given canonical_industries.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
