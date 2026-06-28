# Branch: `claim-redirect-resilience` — progress log

Branched from `main` (post PR #65).

## Progress Update as of 2026-05-26 6:10 PM Pacific
*(Most recent updates at top)*

### The problem (reported repeatedly)
After authenticating to claim a profile — OR after finishing account
setup ("fully validated my account") — the user lands on the HOME
page instead of their /profile page. Prior fixes (PR #60 force-redirect
props) didn't fully stop it.

### Root cause (two bugs, one symptom)
Both `/claim/callback` and `/account/setup` fall back to `"/"` (home)
whenever the eval id `e` is absent:
- `/claim/callback`: `if (!isUuid(e)) redirect("/")`.
- `/account/setup`: `next = e ? "/profile?e=…" : "/"`.

`e` goes missing because **Clerk's OAuth redirect chain drops the
`?e=` query param** (the home page even has a comment admitting this).
The existing home-page auto-claim workaround only recovers if it can
match the user's identity — unreliable. And the "complete your
membership" banner links to `/account/setup` with NO `e` at all, so
finishing setup from the banner always computed `next = "/"`.

### The fix — make the eval id survive, and never strand on home
1. **Cookie that survives the round-trip** (`src/lib/claim-cookie.ts`,
   `ff_claim_eval`, 15 min, SameSite=Lax). Set client-side right
   before every OAuth/email-link handoff (ClaimProfileModal.goSso +
   startEmailLink, /claim page go()).
2. **/claim/callback** reads the cookie when `?e=` is missing, and
   clears it on EVERY exit (incl. early guards) so a stale cookie
   can't ping-pong home ↔ callback.
3. **Home page backstop**: a signed-in user with no claim row, where
   auto-claim also fails, gets redirected to `/claim/callback?e=<cookie>`
   to finish the claim instead of seeing the splash.
4. **/account/setup** recovers `e` from the user's claim row when the
   query param is absent (fixes the banner path), instead of → "/".

### Files
- `src/lib/claim-cookie.ts` (new) — cookie name/maxage + client setter.
- `src/components/ClaimProfileModal.tsx` — set cookie before OAuth +
  email-link.
- `src/app/(authed)/claim/page.tsx` — set cookie before OAuth.
- `src/app/(authed)/claim/callback/route.ts` — cookie fallback for `e`
  + clear-on-exit `done()` helper on all redirects.
- `src/app/(authed)/page.tsx` — cookie backstop for stranded claimers.
- `src/app/(authed)/account/setup/page.tsx` — recover `e` from claim
  row.

### Upstream note (optional, not required by this fix)
The true origin is the Clerk instance's dashboard redirect behavior
(the OAuth sign-up transfer dropping the param / a dashboard default
"/" URL). Setting the Clerk dashboard "after sign-in/up" + allowed
redirect URLs correctly would remove the param loss at the source.
This app-level fix is robust regardless.

### Verified
- `pnpm tsc --noEmit` clean.
- Home → 200 (splash) unauthenticated; /claim/callback → 307.
