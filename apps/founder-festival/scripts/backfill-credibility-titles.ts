// Backfill evaluations.credibility_title for profiles that have none, via a
// cheap title-ONLY Sonnet pass over already-stored data (no re-score). Targets
// scored profiles (score > 0, not code-redeemed) missing a title, highest score
// first. The model returns null for any that are still too thin; those are
// skipped (no write).
//
//   # Scope only (NO LLM, NO writes) against prod:
//   npx tsx scripts/backfill-credibility-titles.ts --target=prod --dry
//   # Run for real against the dev DB:
//   npx tsx scripts/backfill-credibility-titles.ts --target=dev
//   # Run for real against prod (e.g. high-signal first):
//   npx tsx scripts/backfill-credibility-titles.ts --target=prod --signal=high
//
// Flags: --target=dev|prod (dev) · --model=sonnet|haiku|opus (sonnet) · --dry ·
//        --limit=N (all) · --concurrency=N (4) · --signal=high|medium|low ·
//        --only=<substr> / --exclude=<substr> (eval id or name)
import { readFileSync } from "node:fs";

const arg = (name: string, def = "") =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def;
const has = (name: string) => process.argv.includes(`--${name}`);

const target = (arg("target", "dev") as "dev" | "prod");
const model = (arg("model", "sonnet") as "sonnet" | "haiku" | "opus");
const concurrency = Math.max(1, parseInt(arg("concurrency", "4"), 10) || 4);
const limit = parseInt(arg("limit", "0"), 10) || 0; // 0 = no limit
const signal = arg("signal", "").toLowerCase(); // "" = all non-zero-score
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
  const { evaluations } = await import("@/db/schema");
  const { and, desc, eq, gt, isNull, ne, sql } = await import("drizzle-orm");
  const { generateCredibilityTitle } = await import("@/lib/credibility-title");

  const where = [
    isNull(evaluations.credibilityTitle),
    gt(evaluations.score, 0),
    ne(evaluations.source, "code"),
    ...(signal ? [eq(evaluations.signalQuality, signal)] : []),
  ];
  const q = db
    .select({ id: evaluations.id, fullName: evaluations.fullName, score: evaluations.score, signal: evaluations.signalQuality })
    .from(evaluations)
    .where(and(...where))
    .orderBy(desc(evaluations.score));
  let rows = await (limit > 0 ? q.limit(limit) : q);
  if (only) rows = rows.filter((r) => r.id.toLowerCase().includes(only) || (r.fullName ?? "").toLowerCase().includes(only));
  if (exclude) rows = rows.filter((r) => !(r.id.toLowerCase().includes(exclude) || (r.fullName ?? "").toLowerCase().includes(exclude)));

  console.log(`[titles] target=${target} model=${model} signal=${signal || "all"} dry=${dry} → ${rows.length} profile(s) missing a title`);
  void sql;

  if (dry) {
    rows.slice(0, 40).forEach((r, i) => console.log(`  ${String(i + 1).padStart(3)}. ${String(r.score).padStart(5)} ${r.signal.padEnd(6)} ${r.fullName ?? "(no name)"}  [${r.id}]`));
    if (rows.length > 40) console.log(`  … and ${rows.length - 40} more`);
    console.log(`\n[titles] est. cost to execute: ~$${(rows.length * 0.004).toFixed(2)}–$${(rows.length * 0.006).toFixed(2)} (one ${model} call each). NO writes made.`);
    return;
  }

  let done = 0, updated = 0, skipped = 0, failed = 0, totalCost = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const r = rows[cursor++];
      try {
        const out = await generateCredibilityTitle(r.id, model);
        totalCost += out.costUsd;
        if (out.updated) { updated++; console.log(`  ✓ ${r.fullName ?? r.id} — "${out.title}" ($${out.costUsd.toFixed(4)})`); }
        else { skipped++; console.log(`  – ${r.fullName ?? r.id} — skipped (${out.skippedReason})`); }
      } catch (e) {
        failed++;
        console.error(`  ✗ ${r.fullName ?? r.id} — ${(e as Error).message}`);
      }
      done++;
      if (done % 25 === 0) console.log(`[titles] ${done}/${rows.length} · $${totalCost.toFixed(2)} so far`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(`[titles] done. updated=${updated} skipped=${skipped} failed=${failed} totalCost=$${totalCost.toFixed(2)}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
