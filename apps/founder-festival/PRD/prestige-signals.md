## Progress Update as of 2026-06-05 11:42 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
New PRESTIGE / RECOGNITION scored category (rubric v0.0.11). Third-party
recognition (fellowships, major awards, 30u30/TIME100, tier-1 feature profiles)
is now scored consistently by the model as a normal breakdown row with a
confidence level — no overall cap, distinct honors stack, each once.

### Detail of changes made:
- `src/lib/scoring.ts` — added "PRESTIGE / RECOGNITION SUB-RULES" block to
  `SCORING_RUBRIC` (cross-cutting, founder + investor). Tiers: T1 elite +12–18
  (Thiel/Rhodes/MacArthur/Nobel/Turing/NAE-NAS/olympiad), T2 notable +6–10
  (Forbes 30u30/TIME100/Fortune 40u40/tier-1 feature profile), T3 minor +2–4.
  Double-count guard excludes YC / Wikipedia / research (dedicated rules already).
  AXIS SUBSTANCE instruction: when a recognition evidences a competency, name it
  so it routes to the right radar axis; bare recognition scores but is off-radar.
  No schema change — prestige rows are ordinary breakdown rows.
- `src/lib/credibility-vectors.ts` — added substance-first attribution rules:
  `go-to-market`/`distribution`/`growth strategy` → gtm; `scaling the … org` /
  `operating expertise` → operator. So a competency-bearing prestige row affects
  the SPDR/radar; a bare honor stays unmapped (counts in the TOTAL, not lost).
- `src/lib/eval-steps.ts` — new waterfall step "Searching for prestige signals
  (Thiel Fellow, Rhodes, Forbes, Fortune, WSJ…)" + `HOST_TO_STEP` mappings for
  forbes/wsj/fortune/time/nytimes/economist/bloomberg/thielfellowship/macfound →
  the prestige step.
- Tests: +1 attribution test (competency-bearing → axis; bare → null) in
  `credibility-vectors.test.ts`; eval-steps test updated (fortune.com is now a
  prestige host, not unrecognized) + positive prestige-host assertions. 76 pass.
- Doc: `PRD/scoring-rubric-v0.0.1.md` → v0.0.11 (changelog + data-source row +
  "Prestige / Recognition sub-rules" section).

### Potential concerns to address:
- This is a RESCORE-to-apply change (changes what the LLM scores), unlike the
  recent view-time radar fixes. Existing profiles won't show prestige rows until
  rescored.
- Prestige tier assignment is model judgment (no deterministic whitelist in code),
  so run-to-run variance applies; the tier point ranges + double-count guard in
  the prompt are what keep it consistent. If variance proves high, consider a
  deterministic post-score prestige bonus (like MM/GitHub) keyed on detected
  awards — deferred for now per the "score it via the rubric" decision.
- Tier-1-outlet host mapping buckets ALL findings from those outlets under the
  prestige waterfall step (even incidental facts). Cosmetic; acceptable.
