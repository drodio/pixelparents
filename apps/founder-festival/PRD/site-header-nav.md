## Progress Update as of 2026-05-28 08:50 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Site-wide header navigation lands. The Founder Festival logo now has
`Profile | (Account |) Leaderboard | Events` next to it on both the
profile page and the leaderboard page. The current page is rendered in
white text (no link); the others are gold links.

Events click is gated:
- Claimed user → navigates to `/events`.
- Unclaimed visitor on a profile page → opens the ClaimProfileModal
  seeded with the current eval.
- Unclaimed visitor with no eval context (e.g. on /leaderboard signed
  out) → routes to `/` so they can score their LinkedIn first.

Leaderboard heading text changed from "Leaderboard" to
"Festival Leaderboard".

### Detail of changes made:
- `src/components/SiteHeaderNav.tsx` (new): client component. Takes
  `currentPage`, `userProfileHref`, `isAuthed`, optional
  `eventsClaimContext { evaluationId, firstName }`. Shows the Profile
  link only when the viewer's own profile URL is known OR they're on a
  profile page (so the active tab still highlights). Shows Account only
  when signed in.
- `src/lib/current-viewer.ts` (new): shared helper
  `getCurrentViewerContext()` returns `{ isAuthed, profileHref,
  clerkUserId }` so /profile, /leaderboard, /events don't each
  re-implement the users-join logic.
- `src/app/(authed)/events/page.tsx` (new): placeholder coming-soon
  page. Redirects to `/` for unclaimed visitors (the nav already gates
  this, but defensively guarded server-side too).
- `src/app/(authed)/profile/page.tsx`: replaced the header markup —
  logo + SiteHeaderNav on the left, ScoreDetailButton stays on the
  right. Passes `eventsClaimContext` with the current eval so events
  click for an unclaimed visitor opens the claim modal.
- `src/app/(authed)/leaderboard/page.tsx`: replaced the
  three-column logo / title / spacer header with logo + SiteHeaderNav.
  Heading text under it changed from "Leaderboard" to "Festival
  Leaderboard".

### Heads-up: previous deployment didn't ship
PR #118 (per-phrase citations) merged but its production deployment
failed with "No database connection string was provided to neon()" —
DATABASE_URL had gone missing from the production env around that time.
Another agent restored it ~5min before this PR was opened. Merging this
PR triggers a fresh production build that will catch up BOTH the
citations work and this nav work in one deploy.

### Potential concerns to address:
- The "Profile" tab on a profile page is white even when the viewer is
  looking at someone ELSE's profile. Consistent with treating Profile
  as the "tab" they're on, but means an unclaimed visitor still sees
  "Profile" as the active tab. They can't actually click "Profile"
  anywhere else in the nav (we hide the Profile link when
  userProfileHref is null), so there's nowhere awkward to land. Worth
  watching for confusion.
- The Events page is auth-gated by redirect-to-/ for unclaimed
  visitors. A claimed user who lands directly on /events sees the
  coming-soon placeholder; the nav handles the modal-vs-navigate
  distinction for in-app clicks.
