// Model benchmark (model-cost roadmap, Step 3 — 3-tier cascade dial-in). For
// each profile, research runs ONCE, then is scored with haiku/sonnet/opus on
// IDENTICAL inputs — so differences are the model, not the data. Per profile it
// prints each model's score, signalQuality, min row-confidence (the value the
// ladder gate compares to its bar), gap vs Opus, and whether the ladder would
// ACCEPT that tier. The cross-profile summary SIMULATES the Haiku→Sonnet→Opus
// ladder: tier distribution, cascade cost vs always-Opus, the $0.05 target, and
// a CALIBRATION check — when a cheap model was "confident," how far was it from
// Opus? (overconfidence ⇒ raise the bar). Tune with CASCADE_HAIKU_MIN /
// CASCADE_SONNET_MIN env vars.
//
//   npx tsx --env-file=.env.local scripts/bench-models.mjs [url ...]
//
// Cost: ~1 Exa research + 3 Claude scoring calls per profile (~$0.15/profile).
// Does NOT persist anything (uses researchSubject + scoreInputs directly).

import { researchSubject, scoreInputs } from "../src/lib/eval-pipeline.ts";

const MODELS = ["haiku", "sonnet", "opus"];

// 3-tier ladder thresholds (mirror eval-pipeline defaults). A tier ACCEPTS when
// signalQuality !== "low" AND every row's confidence >= its bar.
const HAIKU_MIN = Number(process.env.CASCADE_HAIKU_MIN) || 95;
const SONNET_MIN = Number(process.env.CASCADE_SONNET_MIN) || 85;
const PROFILES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "https://linkedin.com/in/drodio",
      "https://linkedin.com/in/jordanlee",
      "https://linkedin.com/in/alexkim",
      "https://linkedin.com/in/taylorrivera",
      "https://linkedin.com/in/caseymorgan",
    ];

function totals(payload) {
  if (payload.type === "low-signal") return { lowSignal: true, cost: 0 };
  const s = payload.scoring;
  const rows = [...s.founderBreakdown, ...s.investorBreakdown];
  const minConf = rows.length ? Math.min(...rows.map((r) => r.confidence ?? 0)) : 100;
  return {
    founder: s.founderScore,
    investor: s.investorScore,
    combined: s.combinedScore,
    rows: rows.length,
    cost: payload.scoringUsage.costUsd,
    escalate: !!payload.escalate,
    signalQuality: s.signalQuality,
    minConf, // min row confidence — the value the ladder gate compares to the bar
  };
}

// Would this model's result be ACCEPTED at the given confidence bar? Mirrors
// isConfident(): low signal never accepts; otherwise every row must clear the bar.
function accepts(r, bar) {
  if (!r || r.error || r.lowSignal) return false;
  if (r.signalQuality === "low") return false;
  return r.minConf >= bar;
}

const summary = []; // { url, byModel }

for (const url of PROFILES) {
  console.log("\n" + "=".repeat(78));
  console.log("PROFILE:", url);
  const tR = Date.now();
  let inputs;
  try {
    inputs = await researchSubject(url);
  } catch (e) {
    console.log("  research ERROR:", e instanceof Error ? e.message : String(e));
    continue;
  }
  console.log(`research: ${Date.now() - tR}ms · lowSignal=${inputs.lowSignal} · exa $${inputs.exaUsage.costUsd.toFixed(4)} · enrichers=${inputs.enrichments.length}`);
  if (inputs.lowSignal) {
    console.log("  (low signal — nothing to score)");
    continue;
  }

  const results = {};
  for (const model of MODELS) {
    const t0 = Date.now();
    try {
      const payload = await scoreInputs(url, inputs, model);
      results[model] = { ...totals(payload), ms: Date.now() - t0 };
    } catch (e) {
      results[model] = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  console.log("\n  model    founder  investor  combined  rows  signal  minConf   cost      latency   vsOpus  accept?");
  const opus = results.opus && !results.opus.error && !results.opus.lowSignal ? results.opus : null;
  for (const model of MODELS) {
    const r = results[model];
    if (r.error) { console.log(`  ${model.padEnd(8)} ERROR: ${r.error.slice(0, 60)}`); continue; }
    if (r.lowSignal) { console.log(`  ${model.padEnd(8)} (low-signal — not scored)`); continue; }
    const delta = opus && model !== "opus" ? `${r.combined - opus.combined >= 0 ? "+" : ""}${r.combined - opus.combined}` : "—";
    // Would the ladder accept this model here? haiku@95, sonnet@85, opus=terminal.
    const bar = model === "haiku" ? HAIKU_MIN : model === "sonnet" ? SONNET_MIN : 0;
    const acc = model === "opus" ? "terminal" : accepts(r, bar) ? `YES@${bar}` : `no@${bar}`;
    console.log(`  ${model.padEnd(8)} ${String(r.founder).padStart(7)} ${String(r.investor).padStart(9)} ${String(r.combined).padStart(9)} ${String(r.rows).padStart(5)}  ${String(r.signalQuality).padStart(6)}  ${String(r.minConf).padStart(7)}  $${r.cost.toFixed(4)} ${String(r.ms + "ms").padStart(9)}  ${String(delta).padStart(6)}  ${acc}`);
  }
  summary.push({ url, results });
}

// ── Cross-profile summary (the dial-in data) ──
console.log("\n" + "=".repeat(78));
console.log(`SUMMARY (3-tier dial-in · haiku@${HAIKU_MIN} → sonnet@${SONNET_MIN} → opus)`);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const handle = (s) => s.url.split("/in/")[1];

// Profiles where Opus produced a real score — Opus is the reference answer.
const scored = summary.filter((s) => s.results.opus && !s.results.opus.error && !s.results.opus.lowSignal);
if (!scored.length) {
  console.log("  (no profiles where Opus scored — nothing to compare)");
  process.exit(0);
}

// Simulate the ladder per profile: take the first tier that ACCEPTS; else Opus.
// Cumulative cost = sum of every tier we had to run to get there.
const sim = scored.map((s) => {
  const { haiku, sonnet, opus } = s.results;
  let chosen, tier, cost = 0;
  if (haiku && !haiku.error && !haiku.lowSignal) cost += haiku.cost;
  if (accepts(haiku, HAIKU_MIN)) {
    chosen = haiku; tier = "haiku";
  } else {
    if (sonnet && !sonnet.error && !sonnet.lowSignal) cost += sonnet.cost;
    if (accepts(sonnet, SONNET_MIN)) {
      chosen = sonnet; tier = "sonnet";
    } else {
      cost += opus.cost; chosen = opus; tier = "opus";
    }
  }
  return { url: s.url, tier, cost, gapVsOpus: Math.abs(chosen.combined - opus.combined), opusCost: opus.cost };
});

const dist = { haiku: 0, sonnet: 0, opus: 0 };
sim.forEach((x) => dist[x.tier]++);
const n = sim.length;
const cascadeCost = avg(sim.map((x) => x.cost));
const opusCost = avg(sim.map((x) => x.opusCost));
const cascadeGap = avg(sim.map((x) => x.gapVsOpus)); // accepted-tier answer vs Opus

console.log(`  profiles (opus scored): ${n}`);
console.log(`  TIER DISTRIBUTION:  haiku ${dist.haiku} (${((dist.haiku / n) * 100).toFixed(0)}%)  ·  sonnet ${dist.sonnet} (${((dist.sonnet / n) * 100).toFixed(0)}%)  ·  opus ${dist.opus} (${((dist.opus / n) * 100).toFixed(0)}%)`);
const cheaperPct = (1 - cascadeCost / opusCost) * 100;
console.log(`  avg cost/eval:  always-opus $${opusCost.toFixed(4)}  ·  3-tier cascade $${cascadeCost.toFixed(4)}  (${cheaperPct >= 0 ? `${cheaperPct.toFixed(0)}% CHEAPER` : `${Math.abs(cheaperPct).toFixed(0)}% MORE EXPENSIVE`})`);
console.log(`  TARGET: $0.0500/eval — cascade is ${cascadeCost <= 0.05 ? "UNDER ✓" : "OVER ✗"}`);
console.log(`  avg |combined gap| cascade-vs-opus: ${cascadeGap.toFixed(1)}  (lower = cheap tiers agreed with opus when accepted)`);

// CALIBRATION: when a cheap model was "confident" (would be accepted), how far
// was it from Opus? If high-confidence answers still diverge a lot, the model is
// overconfident and the bar should rise. raw = always-accept gap for contrast.
console.log("\n  CONFIDENCE CALIBRATION (does cheap-model confidence track accuracy?)");
for (const [model, bar] of [["haiku", HAIKU_MIN], ["sonnet", SONNET_MIN]]) {
  const usable = scored.filter((s) => s.results[model] && !s.results[model].error && !s.results[model].lowSignal);
  const confident = usable.filter((s) => accepts(s.results[model], bar));
  const shaky = usable.filter((s) => !accepts(s.results[model], bar));
  const gap = (set) => avg(set.map((s) => Math.abs(s.results[model].combined - s.results.opus.combined)));
  console.log(`  ${model.padEnd(6)} confident@${bar}: ${confident.length}/${usable.length}  ·  |gap| when confident ${gap(confident).toFixed(1)}  vs  when shaky ${gap(shaky).toFixed(1)}`);
  if (confident.length) console.log(`         (confident profiles: ${confident.map(handle).join(", ")})`);
}

console.log("\n  per-profile ladder pick:");
sim.forEach((x) => console.log(`    ${handle(x).padEnd(16)} → ${x.tier.padEnd(7)} $${x.cost.toFixed(4)}  gap ${x.gapVsOpus}`));
process.exit(0);
