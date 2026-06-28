# Refactor: split the scoring.ts god file — refactor-scoring-split

## Progress Update as of 2026-06-09 4:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Branched fresh off current `origin/main` (the long-lived refactor-3006 branch was 153
commits stale — main moved fast and had edited the rubric, so a split off that base
would have silently reverted scoring work). Re-did the audit's #1 god-file split on
the CURRENT `scoring.ts` (1,374 lines).

### Detail of changes made:
- `scoring-rubric.ts` — the `SCORING_RUBRIC` prompt, carved BYTE-IDENTICAL
  (md5-verified vs current main: `8b26853e…`), so zero scoring change.
- `scoring-schema.ts` — the Zod schemas + their types (`EXTRACTED_METRICS_SCHEMA`,
  `SCORING_SCHEMA`, `SCORING_IDENTITY_SCHEMA`, `VERIFICATION_TIERS`, `RULE_IDS`,
  `MMHit`, etc.).
- `scoring.ts` — the post-processing helpers + an `export *` barrel re-exporting
  rubric + schema, so all 9 `@/lib/scoring` importers are unchanged. 1,374 → 328 lines.
- Verified: rubric byte-identical, tsc 0 errors, lint clean, full `pnpm run build`
  passes, 88 scoring tests pass. Rubric doc: "no scoring change" changelog entry.

### Potential concerns to address:
- `scoring.ts` is a HOT file (9 commits in the last 3 days). Shipping fast to minimize
  the conflict window; if main edits scoring.ts before this merges, re-sync + re-carve
  (the carve is scripted/byte-preserving).
- Future scoring-prompt edits now go in `scoring-rubric.ts`; schema edits in
  `scoring-schema.ts`; post-processing in `scoring.ts`.
