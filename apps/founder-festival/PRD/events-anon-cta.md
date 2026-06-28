# PRD — events-anon-cta

## Progress Update as of 2026-06-05 11:43 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. (1) The /events page now uses the SAME top header as /profile and
/leaderboard (logo + SiteHeaderNav nav + search box), replacing its bespoke
centered logo/title. (2) Anonymous (signed-out) visitors no longer see the
Upcoming events list — they get a "Check My Score" CTA that links to the
homepage with the find-my-LinkedIn helper open (`/?find=1`). Signed-in users
still see the upcoming list. Past events remain public to everyone.

### Detail of changes made:
- `src/app/events/page.tsx`: fetch `getCurrentViewerContext()` alongside the
  event lists. Header is now `<a logo><SiteHeaderNav currentPage="events" …/>`
  (matches leaderboard), with a centered "Events" h1 below. Upcoming section:
  `viewer.isAuthed` → event cards (or "No upcoming events yet"); anonymous →
  `<AnonUpcomingCta/>` (gold "Check My Score" button → `/?find=1` + "to see which
  events you qualify for").
- `src/components/SplashForm.tsx`: the mount effect now also handles `?find=1` —
  opens the find-my-LinkedIn helper (no name → empty search form) and scrolls to
  it. Reuses the existing scroll-to-helper mechanism.

### Verification done:
- `next build` compiles + typechecks.
- Dev (anonymous): /events shows the shared header + search, the "Check My Score"
  CTA, and hides the upcoming cards; `/?find=1` → 200.

### Potential concerns to address:
- Gating is on `isAuthed` (signed-out vs signed-in), per the request ("anonymous
  users"). A signed-in-but-unclaimed user (no score) still sees the upcoming list;
  revisit if events should be gated on having a SCORE rather than just a session.
