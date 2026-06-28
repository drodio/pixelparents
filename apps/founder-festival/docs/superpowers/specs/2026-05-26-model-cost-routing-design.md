# Model Cost & Routing — Design

**Date:** 2026-05-26
**Branch:** `founder-signals`
**Author:** Claude (with DROdio)

## Goal

Raise overall scoring **fidelity** while **lowering** scoring cost, by being
smart about which Claude model (Haiku / Sonnet / Opus) does what — instead of
one Opus call for every eval.

## Current state

- One **Opus** call per eval (`DEFAULT_MODEL = "opus"`). Sonnet wired (admin
  jobs can pick it); **Haiku not wired**.
- Pricing /1M tok: Opus $15 in / $75 out · Sonnet $3 / $15 · Haiku ~$1 / $5.
- **Prompt caching is OFF.** The large, static `SCORING_RUBRIC` is paid at full
  input price on every call. Cost code already accounts for `cachedInputTokens`
  but nothing sets `cache_control`.
- Scoring is one monolithic `generateText` call. Post-processing already clamps
  points, recomputes totals, and applies verification weighting — so we **don't
  trust the model's arithmetic**, which makes cheaper models safer here.

## Two orthogonal levers

1. **Prompt caching** — cache the static rubric prefix → ~10× cheaper input on
   that chunk. Pure cost win, **zero fidelity change**, any model. Best payoff
   on batch scoring jobs (warm 5-min cache).
2. **Model routing** — cheap model handles the easy majority (lower cost), Opus
   reserved for hard/ambiguous/high-stakes evals (higher fidelity where it
   matters).

## Chosen approach (sequenced)

### Step 1 — Prompt caching (safe cost cut, do first)
Mark the static prefix (`SCORING_RUBRIC` + schema hint) cacheable via the AI
SDK's Anthropic `providerOptions` cache_control, keeping per-subject data after
the cache breakpoint. Verify `cachedInputTokens > 0` on a warm call. Implement
with the `claude-api` skill (correct cache breakpoints + cache-hit verification).

### Step 2 — Benchmark harness (measure before trusting cheap models)
`scripts/bench-models.mjs`: score ~15–20 known profiles (smoke-test founders/
investors with expected outcomes) across haiku/sonnet/opus at temp 0.2; diff
founder/investor totals + breakdown rows + cost. Output a table: where do
Sonnet/Haiku match Opus, where do they break. Add `haiku` to `MODEL_GATEWAY_ID`.

### Step 3 — Escalation cascade (the fidelity+cost win)
Score with the cheap default (Sonnet, maybe Haiku for thin profiles) first;
**escalate to Opus only when** the cheap pass trips a trigger, derived from the
benchmark:
- a high-value row (|points| ≥ 25) with low `confidence`, or `self-asserted`
  verification on a high-value claim (the double-verification danger zone),
- combined score near a decision cutoff (event-invite / leaderboard band),
- `signalQuality = low` or sparse/conflicting evidence.
Most evals stop at the cheap pass. Reuse the existing `confidence` /
`verification` fields as the escalation signal.

### Step 4 (optional) — thin-profile Haiku + per-task decomposition
If the bench shows Haiku is reliable for low-signal profiles, route those to
Haiku. Consider Haiku-extract → Sonnet-rubric → Opus-judgment only if a single
cheap pass proves insufficient (adds orchestration/latency).

## Measurement is the gate
No "higher fidelity" claim without the Step-2 benchmark. The cascade's triggers
are defined by where the bench shows cheap models diverge from Opus.

## Guardrails / notes
- Deterministic post-processing (clamp, recompute, verification-weight) stays —
  it's the safety net that makes cheap models acceptable.
- Cost is already tracked per-eval (`pricing` JSONB + cost_*_cents) — the bench
  and the cascade both read real `costDollars`/usage, not estimates.
- Latency: caching adds none; the cascade adds an Opus call only on escalation
  (the minority). Keep an eye on the p95 for escalated evals.

## Out of scope
Changing the rubric content; the NFX scraper; Batch 3 UI (percentile/press).
