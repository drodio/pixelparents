// Remap ALREADY-orphaned IRL-event ratings onto the current recommendation
// items (their ids changed when recommendations were regenerated). LLM matches
// each orphaned rating to the current event it corresponds to and re-points the
// response so the score re-attaches to the right row. Forward orphaning is
// prevented separately (reEvaluate now preserves rated recommendations).
//
//   # Scope only (NO LLM, NO writes):
//   npx tsx scripts/remap-orphaned-ratings.ts --target=prod --dry
//   # Just one profile:
//   npx tsx scripts/remap-orphaned-ratings.ts --target=prod --only=samuel
//   # All affected:
//   npx tsx scripts/remap-orphaned-ratings.ts --target=prod
//
// Flags: --target=dev|prod (dev) · --model=sonnet|haiku|opus (sonnet) · --dry ·
//        --concurrency=N (4) · --only=<substr> / --exclude=<substr>
import { readFileSync } from "node:fs";

const arg = (name: string, def = "") =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def;
const has = (name: string) => process.argv.includes(`--${name}`);

const target = (arg("target", "dev") as "dev" | "prod");
const model = (arg("model", "sonnet") as "sonnet" | "haiku" | "opus");
const concurrency = Math.max(1, parseInt(arg("concurrency", "4"), 10) || 4);
const only = arg("only", "").toLowerCase();
const exclude = arg("exclude", "").toLowerCase();
const dry = has("dry");

if (!process.env.DATABASE_URL) {
  const file = target === "prod"
    ? "/Users/drodio/Projects/founder-festival/.env.prod.local"
    : "/Users/drodio/Projects/founder-festival/.env.local";
  const env = readFileSync(file, "utf8");
  const pick = (k: string) => env.match(new RegExp("^" + k + "=(.*)$", "m"))?.[1].trim().replace(/^["']|["']$/g, "") ?? "";
  process.env.DATABASE_URL = pick("DATABASE_URL") || pick("POSTGRES_URL_NON_POOLING") || pick("POSTGRES_URL");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) { const v = m[2].trim().replace(/^["']|["']$/g, ""); if (v && !process.env[m[1]]) process.env[m[1]] = v; }
  }
}

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  const { remapOrphanedRatings } = await import("@/lib/event-recommendations");

  const res = await db.execute(sql`
    SELECT e.id::text AS id, e.full_name,
      count(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(e.recommendations->'items', '[]'::jsonb)) it
        WHERE it->>'id' = rr.item_id
      ))::int AS orphaned
    FROM evaluations e
    JOIN recommendation_responses rr ON rr.evaluation_id = e.id
    GROUP BY e.id, e.full_name
    HAVING count(*) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(e.recommendations->'items', '[]'::jsonb)) it
      WHERE it->>'id' = rr.item_id
    )) > 0
    ORDER BY e.full_name`);
  let rows = (Array.isArray(res) ? res : (res as { rows: Record<string, unknown>[] }).rows) as Array<{ id: string; full_name: string | null; orphaned: number }>;
  if (only) rows = rows.filter((r) => r.id.toLowerCase().includes(only) || (r.full_name ?? "").toLowerCase().includes(only));
  if (exclude) rows = rows.filter((r) => !(r.id.toLowerCase().includes(exclude) || (r.full_name ?? "").toLowerCase().includes(exclude)));

  console.log(`[remap] target=${target} model=${model} dry=${dry} → ${rows.length} profile(s) with orphaned ratings`);
  if (dry) {
    const totalOrphans = rows.reduce((a, r) => a + r.orphaned, 0);
    rows.forEach((r) => console.log(`  ${r.full_name ?? "(no name)"} — ${r.orphaned} orphaned  [${r.id}]`));
    console.log(`\n[remap] ${totalOrphans} orphaned ratings across ${rows.length} profiles. est ~$${(rows.length * 0.004).toFixed(2)}–$${(rows.length * 0.008).toFixed(2)}. NO writes made.`);
    return;
  }

  let remapped = 0, unmapped = 0, collisions = 0, failed = 0, totalCost = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const r = rows[cursor++];
      try {
        const out = await remapOrphanedRatings(r.id, model);
        totalCost += out.costUsd;
        remapped += out.remapped; unmapped += out.unmapped.length; collisions += out.collisions.length;
        console.log(`  ✓ ${r.full_name ?? r.id} — remapped ${out.remapped}, unmapped ${out.unmapped.length}, collisions ${out.collisions.length} ($${out.costUsd.toFixed(4)})${out.skippedReason ? ` (${out.skippedReason})` : ""}`);
      } catch (e) {
        failed++;
        console.error(`  ✗ ${r.full_name ?? r.id} — ${(e as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(`[remap] done. remapped=${remapped} unmapped=${unmapped} collisions=${collisions} failed=${failed} totalCost=$${totalCost.toFixed(2)}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
