## Progress Update as of 2026-06-01 12:28 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Scoring v0.0.6: rebalanced + fixed the Majestic Million bonus, and stabilized the
founder_valuation row (it was swinging +1500↔+900 across re-scores).

### Detail of changes made:
- MM bonus is now a LOG curve round(20×(6−log10(rank))) over the full 1..1M range
  (#25,405 → +32 vs +0 before), computed in CODE from the resolved
  primaryCompanyDomain (addCompanyMmBonus / majesticMillionBonus) — the pre-scoring
  lookup ran before the LLM picked the company so it usually missed it. LLM no longer
  emits an MM row. Founders full bonus, employees ×0.1. 4 unit tests.
- founder_valuation rows pinned to verification="authoritative" in code so the
  double-verification step can't ×0.6 them. Fixes the 1500↔900 swing.
- Validated on Geoff: stable founder_score 1563 with +1500 [authoritative] valuation
  and +32 [authoritative] apollographql.com #25,405 MM.

### Potential concerns to address:
- Pinning founder_valuation to authoritative bypasses verification down-weighting for
  that row (intended — valuation magnitude is the signal; rows cite their sources).
- MM founder-vs-employee uses companiesFounded>=1 as the founder proxy (edge case: a
  founder now employed at a DIFFERENT MM company would get the full bonus). Bounded (max ~120).
