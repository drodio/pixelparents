// Backfill: reframe the top-N profiles' "priorities" recommendations into
// proposed IRL Festival events, via a cheap Sonnet pass over already-stored
// data (no re-score). Overwrites evaluations.recommendations in place.
//
//   # Preview the top 100 (NO LLM, NO writes) against prod:
//   npx tsx scripts/backfill-event-recs.ts --target=prod --limit=100 --dry
//   # Run for real against the dev DB:
//   npx tsx scripts/backfill-event-recs.ts --target=dev --limit=100
//   # Run for real against prod:
//   npx tsx scripts/backfill-event-recs.ts --target=prod --limit=100
//
// Flags: --target=dev|prod (default dev) · --limit=N (default 100) ·
//        --model=sonnet|haiku|opus (default sonnet) · --dry (list only) ·
//        --concurrency=N (default 4)
import { readFileSync } from "node:fs";

const arg = (name: string, def = "") =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def;
const has = (name: string) => process.argv.includes(`--${name}`);

const target = (arg("target", "dev") as "dev" | "prod");
const limit = Math.max(1, parseInt(arg("limit", "100"), 10) || 100);
const model = (arg("model", "sonnet") as "sonnet" | "haiku" | "opus");
const concurrency = Math.max(1, parseInt(arg("concurrency", "4"), 10) || 4);
const dry = has("dry");

// --- Self-contained env load (mirrors backfill-founder-status.ts) ---
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
  const { evaluations } = await import("@/db/schema");
  const { and, ne, isNull, isNotNull, desc } = await import("drizzle-orm");
  const { regenerateEventRecsForEval } = await import("@/lib/event-recommendations");

  // Top-N public-leaderboard profiles by combined score that have existing
  // recommendations to reframe (exclude low-signal/code/hidden).
  const rows = await db
    .select({ id: evaluations.id, fullName: evaluations.fullName, score: evaluations.score })
    .from(evaluations)
    .where(
      and(
        ne(evaluations.signalQuality, "low"),
        ne(evaluations.source, "code"),
        isNull(evaluations.hiddenAt),
        isNotNull(evaluations.recommendations),
      ),
    )
    .orderBy(desc(evaluations.score))
    .limit(limit);

  console.log(
    `[event-recs] target=${target} model=${model} limit=${limit} concurrency=${concurrency} dry=${dry} → ${rows.length} profiles`,
  );

  if (dry) {
    rows.forEach((r, i) =>
      console.log(`  ${String(i + 1).padStart(3)}. ${r.score ?? "?"}  ${r.fullName ?? "(no name)"}  [${r.id}]`),
    );
    console.log("[event-recs] dry run — no LLM calls, no writes.");
    return;
  }

  let done = 0, updated = 0, skipped = 0, failed = 0, totalCost = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const r = rows[cursor++];
      try {
        const res = await regenerateEventRecsForEval(r.id, model);
        totalCost += res.costUsd;
        if (res.updated) {
          updated++;
          console.log(`  ✓ ${r.fullName ?? r.id} — ${res.itemCount} events ($${res.costUsd.toFixed(4)})`);
        } else {
          skipped++;
          console.log(`  – ${r.fullName ?? r.id} — skipped (${res.skippedReason})`);
        }
      } catch (e) {
        failed++;
        console.error(`  ✗ ${r.fullName ?? r.id} — ${(e as Error).message}`);
      }
      done++;
      if (done % 10 === 0) console.log(`[event-recs] ${done}/${rows.length} · $${totalCost.toFixed(2)} so far`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(
    `[event-recs] done. updated=${updated} skipped=${skipped} failed=${failed} totalCost=$${totalCost.toFixed(2)}`,
  );
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
