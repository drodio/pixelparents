// Read-only diagnostic: why a profile has no credibility title above its badges.
// Resolves each handle (clerk username OR slug) to its evaluation and prints the
// title/signal/score + scoring-run history. No writes.
//   npx tsx scripts/diagnose-titles.ts --target=prod arash-ferdowsi jensen-huang
import { readFileSync } from "node:fs";

const target = (process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "dev") as "dev" | "prod";
const handles = process.argv.slice(2).filter((a) => !a.startsWith("--"));

if (!process.env.DATABASE_URL) {
  const file = target === "prod"
    ? "/Users/drodio/Projects/founder-festival/.env.prod.local"
    : "/Users/drodio/Projects/founder-festival/.env.local";
  const env = readFileSync(file, "utf8");
  const pick = (k: string) => env.match(new RegExp("^" + k + "=(.*)$", "m"))?.[1].trim().replace(/^["']|["']$/g, "") ?? "";
  process.env.DATABASE_URL = pick("DATABASE_URL") || pick("POSTGRES_URL_NON_POOLING") || pick("POSTGRES_URL");
}

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  for (const h of handles) {
    const res = await db.execute(sql`
      SELECT e.id::text, e.full_name, e.slug, e.slug_kind, e.credibility_title,
        e.signal_quality, e.score, e.founder_score, e.investor_score, e.source,
        e.updated_at,
        (SELECT count(*) FROM scoring_runs sr WHERE sr.evaluation_id = e.id)::int AS runs
      FROM evaluations e
      LEFT JOIN users u ON u.evaluation_id = e.id
      WHERE e.slug = ${h} OR lower(u.clerk_username) = ${h.toLowerCase()}
      LIMIT 3`);
    const rows = (Array.isArray(res) ? res : (res as { rows: Record<string, unknown>[] }).rows) as Record<string, unknown>[];
    console.log(`\n=== /${h} ===`);
    if (!rows.length) { console.log("  (no eval found for that handle)"); continue; }
    for (const r of rows) {
      console.log(`  ${r.full_name} [${r.id}] source=${r.source} runs=${r.runs}`);
      console.log(`    credibility_title: ${r.credibility_title === null ? "NULL" : JSON.stringify(r.credibility_title)}`);
      console.log(`    signal_quality=${r.signal_quality}  score=${r.score} (F${r.founder_score}/I${r.investor_score})  updated=${r.updated_at}`);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
