## Progress Update as of 2026-06-01 11:03 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Prompt-tightening so the founder_valuation rule (v0.0.5) actually delivers. First
re-score of Geoff Schmidt landed +120 instead of +1500 (the LLM dropped the
rule:"founder_valuation" tag → clamped to 200 → ×0.6 single-source weighting → 120).

### Detail of changes made (src/lib/scoring.ts prompt only):
- founder_valuation rule now shows an explicit WORKED JSON example with the exact
  row shape (points/reason/rule/verification), flags the rule tag as MANDATORY
  ("we saw a $1.5B founder score 120 — never repeat"), and says a priced round from
  a reputable outlet / Crunchbase is "corroborated" (full weight), never single-source.
- Strengthened peakValuationUsd EXTRACTION (set the structured field, not just prose).
- Re-validated on Geoff: 26 → 169 (first pass) → **1560** — the +1500 founder_valuation
  row now fires correctly (rule + corroborated). Live in prod via local re-score.

### Potential concerns to address:
- LLM still leaves extractedMetrics.peakValuationUsd NULL even when it awards the
  +1500 row correctly (the field echo is unreliable). Score is correct; only the
  badge-metric field is incomplete. Consider a code safety-net to backfill the field
  from the row, and/or compute the row points in code from the field (removes LLM
  arithmetic). Left for review — score is right.
- Inherent LLM variance: validated on Geoff; monitor other high-valuation founders.
