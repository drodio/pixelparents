# Branch: `delete-also-identity-evals` — progress log

Branched from `main` (post PR #49).

## Progress Update as of 2026-05-26 12:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
QA: "After I deleted my profile and tried to re-run, it served a
cached version." Root cause: the delete API only nukes evals where
the user has a `users` (claim) row. If they ran an eval after the
last delete but never completed the claim flow, the eval lives on as
an unclaimed row keyed by `linkedin_url`. The next `/api/eval` call
to the same URL hits `lookupCachedEval` and returns the orphan.

Fix: extend the delete endpoint to ALSO sweep evals matching the
user's Clerk identity (GitHub username + verified emails), regardless
of whether a claim row exists. The same "is any OTHER user claiming
this eval?" gate still applies — shared evals just lose this user's
claim row and stay intact.

### Files touched:
- `src/app/api/account/delete/route.ts`:
  - Now reads `currentUser()` (tolerant of stale session) and collects
    identity signals from `externalAccounts` (GitHub) + verified
    `emailAddresses`.
  - Merges the identity-match eval ids with the claim-row eval ids
    before the "delete vs just-unclaim" decision.
  - LinkedIn-URL matching is omitted because Clerk's LinkedIn OIDC
    doesn't expose the vanity URL reliably (per
    `src/lib/identity-match.ts`'s notes). GitHub + email cover the
    common cases.

### Manual cleanup done in the same session:
- Deleted orphan eval `cf4fbca8-1d0a-4583-8ce4-6b21a333ea4f`
  (`Daniel Rubén Odio` / `linkedin.com/in/drodio`) from the dev Neon
  branch + its 15 `score_items` so the user can test fresh.

### Important UX note for the user:
- `/api/eval` (the splash form's "Check My Score" path) caches by
  `linkedin_url`. After this fix's deploy, the FIRST re-run after a
  delete IS fresh (no orphan to hit). SUBSEQUENT re-runs of the SAME
  URL will still return the freshly-cached result — that's by design
  for cost and determinism.
- If they want a true re-score on demand, the **Re-Score Me** link on
  the profile page (next to "View on Leaderboard") goes through
  `/api/rescore` which always runs Claude fresh and updates the eval
  in place.

### Potential concerns:
- The identity-match sweep won't catch every edge case (e.g., an
  eval scored for a different email the user used before). Could
  extend to query Clerk's full email + phone history if needed.
