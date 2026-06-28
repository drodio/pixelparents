# Branch: `stale-clerk-session-tolerant` — progress log

Branched from `main` (post PR #48).

## Progress Update as of 2026-05-26 12:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
QA hit a `ClerkAPIResponseError: Not Found` after they deleted their
profile and then tried to rescore. Stack pointed at `isAdmin()` →
`currentUser()` — Clerk's Backend API returns 404 when the session
cookie's userId no longer exists, but `currentUser()` re-throws that
404 as an exception instead of returning null. Several call sites
let the exception escape and crash the page.

Fix:
1. Wrapped every `currentUser()` call site in `.catch(() => null)` so a
   stale-session 404 is treated as "signed out" everywhere. Sites
   patched: `lib/admin.ts` (the one that crashed), `account/setup`,
   `account/page.tsx`, `dashboard/page.tsx`, `claim/callback/route.ts`,
   `api/admin/jobs/route.ts`.
2. Hardened the delete-my-profile flow's client side: after the
   server completes the Clerk + Neon teardown, we now call
   `clerk.signOut()` (to wipe the cookie) and then `window.location =
   "/"` to do a HARD reload. The previous `clerk.signOut({
   redirectUrl: "/" })` did a router-level redirect that could
   sometimes preserve stale in-memory session state on the next page
   load.

### Files touched:
- `src/lib/admin.ts` — `isAdmin()` `currentUser().catch(() => null)`.
- `src/app/(authed)/dashboard/page.tsx`,
  `src/app/(authed)/account/setup/page.tsx`,
  `src/app/(authed)/account/page.tsx`,
  `src/app/(authed)/claim/callback/route.ts`,
  `src/app/api/admin/jobs/route.ts` — same `.catch(() => null)` wrap.
- `src/components/UserBadge.tsx` — delete flow: `clerk.signOut()` +
  `window.location.href = "/"` hard reload.

### How to recover the QA user (right now, before deploy):
- Open DevTools → Application → Cookies → clear the `__session` and
  `__client` cookies for `festival.so` (or localhost on dev). Reload.
  Brand new session.

### Potential concerns:
- The "currentUser → null on Clerk 404" tolerance means a few pages
  no longer surface "your session is broken" errors. They render as
  signed-out instead, which sometimes triggers a redirect to /. Fine
  for the deleted-self case; might mask a different class of broken
  state (e.g. Clerk outage). Worth instrumenting later if it gets
  noisy in prod logs.
