// Recovery: re-run the priorities→events reframe for profiles whose OWNER
// RATINGS were orphaned by the first reframe (their answers render as
// "(untitled)" because the rated item ids no longer exist in the current
// events). For each affected eval we recover the original priority text from the
// immutable scoring_runs snapshots, reframe each rated priority 1:1 into an event
// proxy REUSING the original item id, and merge it back — so the owner's
// Hell No..Hell Yes ratings re-attach automatically (recommendation_responses is
// never touched).
//
//   # Scope only (NO LLM, NO writes) against prod — counts + recoverability:
//   npx tsx scripts/reframe-preserve-ratings.ts --target=prod --dry
//   # Run for real against the dev DB:
//   npx tsx scripts/reframe-preserve-ratings.ts --target=dev
//   # Run for real against prod:
//   npx tsx scripts/reframe-preserve-ratings.ts --target=prod
//
// Flags: --target=dev|prod (default dev) · --model=sonnet|haiku|opus (sonnet) ·
//        --dry (scope only) · --concurrency=N (default 4) ·
//        --only=<substr> / --exclude=<substr> (filter by eval id or name)
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

// --- Self-contained env load (mirrors backfill-event-recs.ts) ---
if (!process.env.DATABASE_URL) {
  const file =
    target === "prod"
      ? "/Users/drodio/Projects/founder-festival/.env.prod.local"
      : "/Users/drodio/Projects/founder-festival/.env.local";
  const env = readFileSync(file, "utf8");
  const pick = (k: string) => {
    const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  };
  process.env.DATABASE_URL =
    pick("DATABASE_URL") || pick("POSTGRES_URL_NON_POOLING") || pick("POSTGRES_URL") || pick("DATABASE_URL_UNPOOLED");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) {
      const v = m[2].trim().replace(/^["']|["']$/g, "");
      if (v && !process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  const { inspectOrphanedRatings, regenerateEventRecsPreservingRatings } = await import(
    "@/lib/event-recommendations"
  );

  // Evals with at least one rating whose item_id is NOT in the current
  // recommendations.items (i.e. orphaned by the reframe).
  const res = await db.execute(sql`
    SELECT e.id::text AS id, e.full_name, e.score,
      count(*)::int AS total_ratings,
      count(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(e.recommendations->'items', '[]'::jsonb)) it
        WHERE it->>'id' = rr.item_id
      ))::int AS orphaned
    FROM evaluations e
    JOIN recommendation_responses rr ON rr.evaluation_id = e.id
    GROUP BY e.id, e.full_name, e.score
    HAVING count(*) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(e.recommendations->'items', '[]'::jsonb)) it
      WHERE it->>'id' = rr.item_id
    )) > 0
    ORDER BY e.score DESC NULLS LAST`);
  let rows = (Array.isArray(res) ? res : (res as { rows: Record<string, unknown>[] }).rows) as Array<{
    id: string; full_name: string | null; score: number | null; total_ratings: number; orphaned: number;
  }>;
  if (only) {
    rows = rows.filter((r) => r.id.toLowerCase().includes(only) || (r.full_name ?? "").toLowerCase().includes(only));
  }
  if (exclude) {
    rows = rows.filter((r) => !(r.id.toLowerCase().includes(exclude) || (r.full_name ?? "").toLowerCase().includes(exclude)));
  }

  console.log(`[preserve] target=${target} model=${model} dry=${dry} → ${rows.length} affected profile(s)`);

  if (dry) {
    let totRecoverable = 0, totUnrecoverable = 0, fullyRecoverable = 0;
    for (const r of rows) {
      const ins = await inspectOrphanedRatings(r.id);
      totRecoverable += ins.recoverable.length;
      totUnrecoverable += ins.unrecoverable.length;
      if (ins.unrecoverable.length === 0) fullyRecoverable++;
      const flag = ins.unrecoverable.length === 0 ? "✓" : "⚠";
      console.log(
        `  ${flag} ${String(r.score ?? "?").padStart(4)}  ${r.full_name ?? "(no name)"} — ${ins.recoverable.length} recoverable, ${ins.unrecoverable.length} lost  [${r.id}]`,
      );
    }
    const estLow = (rows.length * 0.01).toFixed(2);
    const estHigh = (rows.length * 0.02).toFixed(2);
    console.log(
      `\n[preserve] SCOPE: ${rows.length} profiles · ${totRecoverable} ratings recoverable · ${totUnrecoverable} truly lost · ${fullyRecoverable}/${rows.length} fully recoverable`,
    );
    console.log(`[preserve] est. LLM cost to execute: ~$${estLow}–$${estHigh} (one ${model} call per profile). NO writes made.`);
    return;
  }

  let done = 0, updated = 0, skipped = 0, failed = 0, totalCost = 0, lost = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const r = rows[cursor++];
      try {
        const out = await regenerateEventRecsPreservingRatings(r.id, model);
        totalCost += out.costUsd;
        lost += out.unrecoverable.length;
        if (out.updated) {
          updated++;
          console.log(`  ✓ ${r.full_name ?? r.id} — recovered ${out.recovered} rating(s), ${out.itemCount} events ($${out.costUsd.toFixed(4)})${out.unrecoverable.length ? `, ${out.unrecoverable.length} lost` : ""}`);
        } else {
          skipped++;
          console.log(`  – ${r.full_name ?? r.id} — skipped (${out.skippedReason})`);
        }
      } catch (e) {
        failed++;
        console.error(`  ✗ ${r.full_name ?? r.id} — ${(e as Error).message}`);
      }
      done++;
      if (done % 10 === 0) console.log(`[preserve] ${done}/${rows.length} · $${totalCost.toFixed(2)} so far`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(
    `[preserve] done. updated=${updated} skipped=${skipped} failed=${failed} ratingsTrulyLost=${lost} totalCost=$${totalCost.toFixed(2)}`,
  );
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
