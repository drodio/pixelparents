# Split eval-pipeline.ts — split-eval-pipeline

## Progress Update as of 2026-06-10 — Refactor P1-7 (incremental)
*(Most recent updates at top)*

### Summary of changes since last update
Began decomposing the eval-pipeline.ts god file (1466 LOC) by extracting the two
cleanest, fully-acyclic leaf modules. Pure code-move; no behavior change.

### Detail of changes made:
- **`src/lib/scoring-bonuses.ts`** — the deterministic post-scoring bonuses
  (Majestic Million prominence, company-org GitHub OSS, LinkedIn followers,
  enterprise-value dollar curve, HN citation deep-linking + `lookupMmRanksForDomains`).
  ~210 lines. `hnCitationsForReason` re-exported from eval-pipeline for API compat
  (a test imports it from there).
- **`src/lib/scoring-cost.ts`** — model pricing constants, `ScoringUsage`/`EvalPricing`
  types, `buildCostFields`, `computeScoringCostUsd`. `ScoringModel` is a type-only
  import from eval-pipeline (erased → no runtime cycle); the two types are
  re-exported from eval-pipeline.
- eval-pipeline.ts: 1466 → 1230 LOC. Dead imports pruned.

### Deferred (safe follow-ups, not done here):
- `eval-persistence.ts` (rowToResult/lookupCachedEval/payloadToWriteFields/
  persistScoreItems/investorFacets/…) — the declarations are SCATTERED across the
  file (7+ cuts), higher edit-risk; left for a focused follow-up.
- `scoring-llm.ts` (scoreWithClaude/SCHEMA_HINT/extractJsonObject) — extractable
  acyclically, but the cascades (scoreWithCascade/3Tier) must stay with scoreInputs
  in the orchestrator to avoid a runtime cycle.

### Potential concerns to address:
- eval-pipeline.test.ts is in vitest.ci NOT_YET_ISOLATED (excluded from CI), so the
  scoring path has no CI gate. Verified locally: tsc 0, lint clean, no runtime
  import cycle (module loads), full suite shows the SAME 8 pre-existing DB-gated
  failures + 1102 pass (zero new). hn-citations re-export test passes.
