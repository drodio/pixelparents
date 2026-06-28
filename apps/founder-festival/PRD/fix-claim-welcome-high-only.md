## Progress Update as of 2026-06-08 10:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the claim-welcome email going to non-owning claimers (the Jon Staenberg bug). The 2-min sweep sent the "you claimed your profile" email to anyone with an `evaluationId`, including `medium` (LinkedIn name-only) matches who are NOT owners — contradicting the profile/leaderboard, which treat claimed = `high` only. Now the sweep + backlog count are high-confidence only. First step of the larger "claimed = high everywhere" alignment.

### Detail of changes made:
- `src/lib/welcome-email-sweep.ts`:
  - `runClaimWelcomePass` and `countUnsentClaim` now `AND eq(users.matchConfidence, "high")` into their WHERE clause, so only owning claims are emailed/counted.
  - `dev_api_welcome` path is untouched (it keys on `api_keys`, not claim confidence).
- Verified: tsc clean; `tests/lib/welcome-email-sweep.test.ts` still passes (its mock returns seeded rows regardless of the WHERE, so the filter is transparent to it).
- Prod context: 32 `medium` claimers (all `linkedin-name-match`) vs 9 `high`. This change stops the 32 from receiving the claim email.

### Potential concerns to address:
- This is only the EMAIL surface. The display surfaces still treat `medium` as claimed in places (leaderboard.ts:432, founder-matrix.ts:119, canonical-profile-url.ts:27, family.ts:21/248, score-payload/profiles-scored). The follow-up PR aligns those to `high` AND adds the verify-to-own flow (Option 2: email-match auto-upgrade + logged LinkedIn-URL self-attestation) so the 32 mediums have a one-click path to ownership.
- Until the verify flow ships, flipping display surfaces would strand the 32 — so the alignment + verify flow must land together (this email fix is safe to ship alone).
