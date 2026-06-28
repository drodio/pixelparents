## Progress Update as of 2026-06-05 5:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented the full API upgrade (option B). Enriched the score + leaderboard
payloads, closed the priorities-privacy leak, added four new v1 endpoints, and
rewrote the `/developers` docs + agent guide. All new/changed unit tests pass;
`next build` compiles clean.

### Detail of changes made:
- `score-payload.ts`: score payload is now the full non-owner profile —
  added profile_href, company_url, avatar_url, location (high-confidence claim
  only), founder/investor status, canonical_industries, badges (reuses
  `computeBadges`), investor focus block (stage/industry/leads/check_size),
  neo, credibility radar (`getCredibilityRadars`), and the peer matrix
  (`getMatrixCandidates`+`computeMatrix`, evalId dropped). Priorities now
  scrub text/category for owner-private items (mirrors profile/page) and flag
  `private`. Summary confirmed NOT per-viewer private — left as-is.
- `leaderboard.ts` + `leaderboard-payload.ts`: added `canonicalIndustries` to
  `LeaderboardRow` (select + decorate) and exposed founder_status,
  investor_status, canonical_industries on the API row. Extracted
  `toLeaderboardApiRow` for reuse by search.
- New routes: `GET /api/v1/search`, `GET /api/v1/events`,
  `GET /api/v1/events/[slug]`, `GET /api/v1/industries`. New lib
  `api/events-payload.ts` (public projection — no host email/PII).
- Leaderboard `industry` + stage/outcome/badge/raised/team filters already
  worked via `parseLeaderboardFilter`; now documented.
- Docs: full rewrite of `agent-guide.ts` and the `/developers` page (capability
  list, endpoints table, example JSON response).
- Tests: extended score-payload + leaderboard-payload + agent-guide; new
  events-payload test. Pre-existing flaky failures in sms/hn-tokenmaxxing/
  majestic-million are unrelated (base is flakier than this branch).

### Potential concerns to address:
- `GET /api/v1/score` now loads the matrix population per call (5-min in-memory
  cache). Same load the profile page already incurs; watch p95 latency.
- `sms.test.ts` has pre-existing TS errors (vitest/esbuild ignores them); not
  touched here.

## Progress Update as of 2026-06-05 12:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Branch created to upgrade the public `/api/v1` surface and rewrite the `/developers`
docs. Brainstormed scope with the owner and committed an approved design spec at
`docs/superpowers/specs/2026-06-05-api-public-profile-expand-design.md`. No code yet.

### Detail of changes made:
- Goal: expose everything a non-owner profile viewer sees via the API — scores,
  breakdown, credibility radar (spider graph), founder/investor matrix
  (most-like-you / complementary / least-like-you), badges, status markers,
  canonical industries, claimed-only location, investor focus, Neo backlink — while
  exposing NO PII (email/phone/raw blobs) and NO owner-private items.
- Scope decision: "option A" — enrich existing endpoints only; defer new endpoints
  (search, events, industries taxonomy) and leaderboard-row location.
- Known privacy gap to fix: `fetchScorePayload` returns `current_priorities`/summary
  without consulting `recommendationVisibility`, leaking owner-private priorities.
- Key reused libs: `src/lib/credibility.ts` (`getCredibilityRadars`),
  `src/lib/founder-matrix.ts` (`computeMatrix` + cached `getMatrixCandidates`),
  `src/lib/credibility-vectors.ts`.
- Location rule confirmed: profile page only renders location for high-confidence
  claims from `users.city/region/country`; operator/CSV `subject_*` is never public.

### Potential concerns to address:
- `score` latency/cost: the matrix loads the whole scored population (5-min in-memory
  cache in founder-matrix.ts). Confirm the cache survives across API requests.
- Summary-privacy model must be verified against `profile/page.tsx:489-496` before
  shipping so the API hides exactly what the non-owner profile view hides.
- Radar/matrix dimensions must be null exactly when the profile page hides them.
