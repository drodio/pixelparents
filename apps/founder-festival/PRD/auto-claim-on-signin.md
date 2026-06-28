# Branch: `auto-claim-on-signin` — progress log

Branched from `main` (post PR #40).

## Progress Update as of 2026-05-26 10:10 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
QA: user authed via GitHub from the Claim Profile modal and landed
back on the splash homepage instead of their profile. Root cause: the
`/claim/callback` redirect chain depends on the `?e=<uuid>` query
param surviving the OAuth round-trip, and at least one branch of the
callback redirects to `/` when that param is missing. Whatever
provider was used, the param can get lost.

Fix: auto-claim. When a signed-in Clerk user lands on `/` (the
homepage redirect path) WITHOUT an existing claim row, the home page
now looks up an eval that matches their Clerk identity and creates
the claim row inline:

- GitHub username (from `user.externalAccounts` with provider
  `oauth_github`) → eval whose `profile->>'githubUsername'` matches
  (case-insensitive)
- LinkedIn URL (best-effort scan of external accounts) → eval whose
  `linkedin_url` matches
- Verified primary email → eval whose `profile->>'publicEmail'` matches

On match: insert a `users` row with `matchConfidence='high'`,
`verifiedSignal` set to which path matched (`github-username`,
`linkedin-url`, `email-exact`), and redirect to the profile.
On no-match: render the splash unchanged.

### Detail of changes made:
- `src/lib/auto-claim.ts` (new) — `tryAutoClaim(clerkUserId, user)`
  returns `{ evaluationId, signal } | null`.
- `src/app/(authed)/page.tsx` — after the existing "signed in WITH a
  claim → redirect" branch, fall through to `tryAutoClaim()` for
  signed-in users without a claim. Idempotent (the helper checks for
  an existing claim before doing any work).

### Potential concerns:
- Auto-claim runs on EVERY home-page hit by a signed-in user without
  a claim. If they don't match anything, three DB queries fire and
  return empty. Fine for now; can short-circuit with a cache later.
- The LinkedIn URL extraction from Clerk is best-effort (scans
  `profileImageUrl` for "linkedin"). The matcher in
  `src/lib/identity-match.ts` notes that Clerk's LinkedIn OIDC
  doesn't expose the vanity URL, so this signal mostly won't fire.
  GitHub + email are the reliable paths.
- This doesn't replace `/claim/callback` — the callback still runs
  when the user comes from the modal flow. Auto-claim is the
  safety net for when the callback's query-param-passing breaks.
