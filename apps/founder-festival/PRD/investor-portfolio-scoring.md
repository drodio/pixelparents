## Merge update — synced with main

Merged origin/main; rubric-doc changelog conflict resolved (kept both: my investor-evidence entry + the parallel agent breakdown-rows refactor note).

## Progress Update as of 2026-06-10 (Pacific)
*(Most recent updates at top)*

### Summary
Fixed thin investor scoring for prolific ANGELS (a famous chip-company founder = 0 investor pts). Root cause: investor signals are firm-centric (NFX/Neo/SEC) and nothing surfaced personal angel investments. Verified BrightData has NO investor/investments dataset (Crunchbase person returned empty for that founder). Fix = strengthen the Exa grounded-facts investor query + tie the existing investor rubric to it. No migration, same Exa call.

### Detail
- `src/lib/exa-grounding.ts`: query now explicitly asks for every startup the subject backed (angel/seed/rounds led, board/advisor seats) + outcomes + total portfolio count. New `portfolioCount` field (stated count, else # enumerated, min). Rendered into GROUNDED FACTS as "Investor portfolio: ~N companies"; notableInvestments slice raised to 15.
- `src/lib/scoring-rubric.ts`: the existing "per active investment +1 (cap +50)" + portfolio-outcome rules now point at the grounded count + cited "Investment: <co> (ipo/…)" lines, with an explicit "don't leave a real angel at 0" note.

### Concerns
- Investor recall now depends on Exa surfacing the angel's investments; very private angels still under-score. The investor rubric weighting itself was already adequate — this is a DATA-surfacing fix.
- That profile needs a re-score to pick this up.
