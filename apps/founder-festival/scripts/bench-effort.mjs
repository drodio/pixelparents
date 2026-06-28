// Effort sweep (model-cost roadmap, Step 3 — the cost lever that keeps Opus).
// For each profile, research runs ONCE, then is scored with Opus at several
// reasoning-effort levels on IDENTICAL inputs. Reports cost, output tokens, the
// combined score, and the gap vs effort=high (the de-facto default) — so we can
// see whether a cheaper effort keeps the SAME judgment. Goal: find the cheapest
// effort whose scores still track high, pushing avg cost toward the $0.05 target.
//
//   npx tsx --env-file=.env.local scripts/bench-effort.mjs [url ...]
//
// Cost: ~1 Exa research + N Opus scoring calls per profile. Persists nothing.

import { researchSubject, scoreInputs } from "../src/lib/eval-pipeline.ts";

const EFFORTS = ["low", "medium", "high", "xhigh"];
const REF = "high"; // reference effort the others are compared against
const PROFILES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "https://linkedin.com/in/drodio",
      "https://linkedin.com/in/jordanlee",
      "https://linkedin.com/in/alexkim",
    ];

function totals(payload) {
  if (payload.type === "low-signal") return { lowSignal: true };
  const s = payload.scoring;
  return {
    founder: s.founderScore,
    investor: s.investorScore,
    combined: s.combinedScore,
    rows: s.founderBreakdown.length + s.investorBreakdown.length,
    cost: payload.scoringUsage.costUsd,
    outTokens: payload.scoringUsage.outputTokens,
  };
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const summary = []; // { url, byEffort }

for (const url of PROFILES) {
  console.log("\n" + "=".repeat(78));
  console.log("PROFILE:", url);
  let inputs;
  try {
    inputs = await researchSubject(url);
  } catch (e) {
    console.log("  research ERROR:", e instanceof Error ? e.message : String(e));
    continue;
  }
  console.log(`research: lowSignal=${inputs.lowSignal} · exa $${inputs.exaUsage.costUsd.toFixed(4)} · enrichers=${inputs.enrichments.length}`);
  if (inputs.lowSignal) { console.log("  (low signal — nothing to score)"); continue; }

  const byEffort = {};
  for (const effort of EFFORTS) {
    const t0 = Date.now();
    try {
      const payload = await scoreInputs(url, inputs, "opus", effort);
      byEffort[effort] = { ...totals(payload), ms: Date.now() - t0 };
    } catch (e) {
      byEffort[effort] = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  console.log("\n  effort   founder  investor  combined  rows   outTok   cost      latency   vsHigh");
  const ref = byEffort[REF] && !byEffort[REF].error ? byEffort[REF] : null;
  for (const effort of EFFORTS) {
    const r = byEffort[effort];
    if (r.error) { console.log(`  ${effort.padEnd(8)} ERROR: ${r.error.slice(0, 60)}`); continue; }
    const delta = ref && effort !== REF ? `${r.combined - ref.combined >= 0 ? "+" : ""}${r.combined - ref.combined}` : "—";
    console.log(`  ${effort.padEnd(8)} ${String(r.founder).padStart(7)} ${String(r.investor).padStart(9)} ${String(r.combined).padStart(9)} ${String(r.rows).padStart(5)}  ${String(r.outTokens).padStart(6)}  $${r.cost.toFixed(4)} ${String(r.ms + "ms").padStart(9)}  ${String(delta).padStart(6)}`);
  }
  summary.push({ url, byEffort });
}

// ── Cross-profile summary ──
console.log("\n" + "=".repeat(78));
console.log(`SUMMARY (effort sweep · ref=${REF} · target $0.0500/eval scoring)`);
const usable = summary.filter((s) => s.byEffort[REF] && !s.byEffort[REF].error);
if (!usable.length) { console.log("  (no profiles scored at reference effort)"); process.exit(0); }
console.log("\n  effort   avg cost   avg outTok   avg |gap vs high|   max |gap|");
for (const effort of EFFORTS) {
  const rows = usable.map((s) => s.byEffort[effort]).filter((r) => r && !r.error);
  if (!rows.length) { console.log(`  ${effort.padEnd(8)} (all errored)`); continue; }
  const cost = avg(rows.map((r) => r.cost));
  const out = avg(rows.map((r) => r.outTokens));
  const gaps = usable
    .filter((s) => s.byEffort[effort] && !s.byEffort[effort].error)
    .map((s) => Math.abs(s.byEffort[effort].combined - s.byEffort[REF].combined));
  const maxGap = gaps.length ? Math.max(...gaps) : 0;
  console.log(`  ${effort.padEnd(8)} $${cost.toFixed(4)}   ${String(Math.round(out)).padStart(6)}      ${avg(gaps).toFixed(1).padStart(6)}            ${String(maxGap).padStart(5)}`);
}
console.log("\n  NOTE: +$0.025 Exa research is added on top of scoring cost for the eval total.");
process.exit(0);
