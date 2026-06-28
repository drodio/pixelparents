## Progress Update as of 2026-06-09 1:45 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Per decision: grandfather all existing `medium` (LinkedIn name-only) claimers to `high` (trusted accurate) so they stay claimed under the high-only flip; future name-only claims stay `medium` and use the verify banner. Added a never-downgrade guard so the grandfather sticks.

### Detail of changes made:
- `src/app/(authed)/claim/callback/route.ts`: the `onConflictDoUpdate` no longer blindly overwrites confidence on re-auth. A re-auth with a weaker signal on the SAME eval (e.g. LinkedIn name-only → medium) keeps the stored `high` confidence/signal/via (CASE guard); a different eval recomputes normally. Protects grandfathered + verified owners from accidental demotion.
- `scripts/grandfather-medium-claims.ts` (new): one-time idempotent backfill, `<dev|prod>` with prod-host guard, `UPDATE users SET match_confidence='high' WHERE match_confidence='medium'`. Keeps `verified_signal='linkedin-name-match'` so grandfathered rows are self-identifying (high + name-match).
- Run on prod after merge so the 32 stay claimed.

## Progress Update as of 2026-06-09 12:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Aligned "claimed" = `high` (owner-grade) confidence across every surface, and added the verify-to-own flow (Option 2) so name-only (`medium`) claimers can earn ownership. Lands together so the 32 existing mediums aren't stranded the moment display surfaces flip to high-only.

### Detail of changes made:
- Display surfaces flipped `["high","medium"]` → `high` (a medium = LinkedIn name-only match links for dedup but is NOT the owner):
  - `src/lib/leaderboard.ts` (claimed badge/avatar/canonical username) — added `eq` to the drizzle import.
  - `src/lib/founder-matrix.ts`, `src/lib/canonical-profile-url.ts`, `src/lib/family.ts` (getOwnerEvaluationId + searchClaimableViewers), `src/lib/api/score-payload.ts` (public API `claimed`), `src/lib/profiles-scored.ts` (admin claimed), `src/app/(authed)/profile/page.tsx` low-signal `lsIsOwner`.
- Verify-to-own (Option 2 — user-approved):
  - `src/lib/identity-match.ts`: new `MatchSignal` value `linkedin-url-attested` (auto-`high` via existing `signalConfidence`).
  - `src/app/api/claim/verify/route.ts` (new): for an EXISTING medium claimer — (1) tries every verified Clerk email vs the eval's email tiers → high; (2) else on `attest:true` accepts a LinkedIn-URL self-attestation → high, `verifiedSignal=linkedin-url-attested` (durable audit) + `console.warn`; (3) else returns `canAttest`. Per-user rate-limited; requires an existing claim row.
  - `src/components/VerifyToOwnBanner.tsx` (new): client banner for a medium claimer on their own profile — one-click "Verify" (email auto-match) then a LinkedIn-URL attestation step; `router.refresh()` on success.
  - Wired into `profile/page.tsx` where `viewerHasClaim && !isOwner`.
- The email-bug fix (claim-welcome → high only) already shipped separately (PR #276).
- Verified: full `tsc --noEmit` clean (only unrelated pre-existing `@tiptap` local-resolution noise); changed files lint-clean apart from a pre-existing `<a href="/">` warning.

### Potential concerns to address:
- Attestation is intentionally weak (anyone who completed LinkedIn OAuth under the matching name can attest → high). Audit = `users.verifiedSignal='linkedin-url-attested'`; review periodically.
- `find-email` route still uses `high|medium` deliberately (admin cost guard) — left as-is.
- The 32 existing mediums now show as unclaimed on public surfaces until they use the verify banner; expected under the chosen direction.
