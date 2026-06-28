## Progress Update as of 2026-06-06 12:05 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Makes the v0.0.11 PRESTIGE tier actually fire. The Exa deep-research query only
named funding/company terms, so honors were never surfaced and the model had no
prestige facts to score. Added prestige terms to the query.

### Detail of changes made:
- `src/lib/exa.ts` `researchLinkedinProfile` — query now also names awards / honors /
  Forbes / Fortune / TIME / 30-under-30 / fellowship / Thiel / Rhodes / MacArthur /
  press. `numResults` unchanged (10) → no cost change.
- Root cause found by dev rescore: a well-known consumer-marketplace founder scored
  ZERO prestige rows despite TIME100/Forbes coverage; his 33k-char research blob
  contained no award facts.
- Validated by dev rescore AFTER the change: blob now contains forbes/time/fortune/
  award/honor/recognized/named, and the founder scores "Named to Fortune's 40 Under 40
  (+8, T2)" — correctly OFF-RADAR (bare recognition counts in total, not on the
  spider graph). Funding recall unharmed (SEC Form D $201.6M + structured fields).

### Potential concerns to address:
- Broadening the single shared research query slightly trades funding-result slots
  for prestige slots (numResults=10). Empirically funding recall held (the founder kept
  all funding facts), because SEC EDGAR + LinkedIn text + structured fields also
  feed funding. Monitor; if a non-prestige founder loses funding recall, bump
  numResults or split into a second small prestige search.
- Prestige detection still depends on Exa surfacing the honor; very obscure honors
  may still be missed. Acceptable — the model only scores grounded facts (no
  hallucinated prestige).
- One observed attribution quirk: a prestige row naming a podcast called "Exit"
  routed to traction via the `\bexit\b` rule. Rare false-positive; not worth
  weakening the (important) exit rule.
