## Merge update — synced with main

Merged origin/main; only conflict was the rubric-doc changelog (kept both: my patents/twitter entry + the parallel agent's credibilityTitle SCHEMA_HINT fix). tsc clean.

## Progress Update as of 2026-06-10 (Pacific)
*(Most recent updates at top)*

### Summary
Added two new scoring sources — USPTO patents (synchronous enricher) + X/Twitter (async bd_async dataset). NO migration (patents=facts only; twitter=existing bd_async column). Both identity-safe.

### Detail
- `src/lib/uspto.ts` (NEW): USPTO ODP patent search by inventor (POST /api/v1/patent/applications/search, X-API-KEY).
- `src/lib/enrichers/patents.ts` (NEW): `[patents]` sync enricher. Corroboration = inventor name-match AND assignee company contains a subject company token (drops same-name inventors). Facts = patent count + assignee + a title → technical/domain.
- `src/lib/bd-datasets.ts`: `twitter` registry entry (X Profiles gd_lwxmeb2u1cniijd7t4). Handle resolved from the subject's OWN LinkedIn bio_links (self-listed → exact identity). Facts = followers/verified → distribution. `twitterHandleFromLinkedin` exported.
- index.ts: registered patents (sync); twitter flows via BD_DATASETS spread. EXPECTED_SOURCES + bdCitationFor updated.
- eval-steps.ts: 2 new waterfall steps (USPTO + X/Twitter) + host mappings (uspto.gov, x.com, twitter.com).
- scoring-rubric.ts: PATENTS + X/TWITTER REACH blocks (technical / distribution; no double-count; no point disclosure).
- Tests: patents.test.ts (corroboration/facts/handle) + bd-datasets update. 19+ pass. Live-verified Jensen Huang → 2 NVIDIA-corroborated patents.

### Concerns
- Twitter coverage limited to profiles that list X on their LinkedIn (safe but partial). Broader handle resolution (Exa-surfaced) is a refinement.
- USPTO is patent APPLICATIONS (granted flagged via status); rate limits unknown — enricher is best-effort + skips on error.
- OPEN (user ask): investor scoring is thin (Jensen Huang = 0 investor pts). Crunchbase PERSON gives board/advisor roles but not direct investments; need a Crunchbase investments source or an Exa investor-grounded search.
