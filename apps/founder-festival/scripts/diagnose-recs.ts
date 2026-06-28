// Read-only diagnostic: why a profile's IRL-event ratings render on the wrong
// rows. Resolves a handle (clerk username OR slug) → eval, then prints the
// current recommendations.items vs the saved recommendation_responses and flags
// which response item_ids are orphaned (not in current items). No writes.
//   npx tsx scripts/diagnose-recs.ts --target=prod samuel-odio
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
    const er = await db.execute(sql`
      SELECT e.id::text AS id, e.full_name, e.recommendations
      FROM evaluations e LEFT JOIN users u ON u.evaluation_id = e.id
      WHERE e.slug = ${h} OR lower(u.clerk_username) = ${h.toLowerCase()} LIMIT 1`);
    const erow = ((Array.isArray(er) ? er : (er as { rows: Record<string, unknown>[] }).rows) as Record<string, unknown>[])[0];
    console.log(`\n=== /${h} ===`);
    if (!erow) { console.log("  (no eval found)"); continue; }
    const recs = (erow.recommendations as { items?: Array<{ id: string; text: string }> } | null) ?? null;
    const items = recs?.items ?? [];
    const itemIds = new Set(items.map((i) => i.id));
    console.log(`  ${erow.full_name} [${erow.id}]`);
    console.log(`  CURRENT items (${items.length}):`);
    items.forEach((i) => console.log(`    [${i.id}] ${String(i.text).slice(0, 55)}`));

    const rr = await db.execute(sql`
      SELECT item_id, rating, source, category, edited_text, created_at
      FROM recommendation_responses WHERE evaluation_id = ${String(erow.id)} ORDER BY created_at`);
    const rrows = (Array.isArray(rr) ? rr : (rr as { rows: Record<string, unknown>[] }).rows) as Record<string, unknown>[];
    console.log(`  RESPONSES (${rrows.length}):`);
    rrows.forEach((r) => {
      const orphan = !itemIds.has(String(r.item_id));
      console.log(`    ${orphan ? "ORPHAN" : "  ok  "} [${r.item_id}] rating=${r.rating} src=${r.source} cat=${r.category} edited=${r.edited_text ? JSON.stringify(String(r.edited_text).slice(0, 40)) : "null"}`);
    });
    const orphans = rrows.filter((r) => !itemIds.has(String(r.item_id)));
    console.log(`  => ${orphans.length} orphaned response(s) of ${rrows.length}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
