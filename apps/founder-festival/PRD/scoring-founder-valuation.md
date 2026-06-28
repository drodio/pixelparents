## Progress Update as of 2026-06-01 09:55 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Scoring rubric v0.0.5 — fixes founders of high-valuation companies being severely
underscored (motivating case: Geoff Schmidt / Apollo GraphQL scored 26 because the
$1.5B valuation + ~$180M raised never reached his profile).

### Detail of changes made (src/lib/scoring.ts + PRD/scoring-rubric-v0.0.1.md):
- R2: new `founder_valuation` rule — still-private company's peak post-money valuation
  scores max(1, floor(peakValuationUsd/$1M)), UNCAPPED ($1.5B→+1500). Added
  peakValuationUsd to EXTRACTED_METRICS_SCHEMA; added founder_valuation to RULE_IDS +
  UNCAPPED_UPPER_RULES. Supersedes "Venture raised" for the same company (no double-count).
- R1: prompt now names funding/valuation extraction a TOP priority (populate totalRaisedUsd
  + peakValuationUsd from company funding news, not just SEC).
- R4: GitHub now attributes the COMPANY's org repos for founders, and NEVER applies the
  dormant -15 penalty to a verified founder/CEO.
- Rubric md accuracy fix: documented the dollar-weighted founder_exit rule (md still showed
  a stale flat +10 per exit). Bumped to v0.0.5.
- Tests: peakValuationUsd parse, founder_valuation uncapped clamp (45 scoring tests green).

### Potential concerns to address:
- R3 (Majestic Million) NOT implemented: formula min(100,floor(10000/rank)) yields +0 past
  rank ~10k AND the MM lookup runs before the company domain is resolved — immaterial for
  Apollo (#25,405→+0). Deferred as a separate MM formula/timing rebalance decision.
- This changes ALL future scoring + the LLM prompt. Validate by re-scoring Geoff after merge
  (expect ~26 → ~1600). No DB migration (peakValuationUsd is in profile JSONB).
