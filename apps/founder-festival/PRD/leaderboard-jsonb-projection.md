# Leaderboard JSONB projection — leaderboard-jsonb-projection

## Progress Update as of 2026-06-10 — Perf P1-2
*(Most recent updates at top)*

### Summary of changes since last update
The leaderboard SELECTed the entire `profile` JSONB blob per row, though
decorateRows reads <5% of it. Now it projects only the 4 keys it actually uses.

### Detail of changes made:
- `PROFILE_PROJECTION` (`jsonb_build_object`) returns only `primaryCompanyDomain`,
  `identity.companyName`, `extractedMetrics`, `mmHits` — the structured fields
  decorateRows + computeBadges read. The two object/array sub-fields are passed
  through WHOLE, so values are byte-identical; only the unread multi-KB narrative
  (bio, grounding, enrichment dumps, bd_async facts) is dropped from the wire.
- Applied at all 3 leaderboard select sites (main, attendee-decoration, search).
- Validated against the dev DB: all 4 keys present, mmHits/extractedMetrics intact.

### Potential concerns to address:
- If a future decorateRows consumer needs another profile key, it must be added
  to PROFILE_PROJECTION (ProfileBlob type is the contract).
