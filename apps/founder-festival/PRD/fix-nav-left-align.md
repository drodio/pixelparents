# fix-nav-left-align

## Progress Update as of 2026-06-08 12:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the top nav (FF logo + Profile/Account/Leaderboard/Events/Search) being
**centered** on /leaderboard, /events, and event detail pages — it now hugs the
top-left edge to match /profile. The page content below stays centered as before.

### Detail of changes made:
- Root cause: the shared `SiteHeaderNav` is fine; each page wrapped it
  differently. /profile renders its `<header>` full-width with no max-width
  (logo/nav sit far left). /leaderboard put `max-w-4xl mx-auto` on the header
  itself; /events and /events/[slug] nested the header inside a
  `max-w-Nxl mx-auto` content column — both centered the nav.
- `src/app/(authed)/leaderboard/page.tsx`: removed `max-w-4xl mx-auto` from the
  `<header>` (kept `w-full`). Content elements keep their own `max-w-4xl mx-auto`.
- `src/app/(authed)/events/page.tsx`: moved the logo/nav `<header>` OUT of the
  `max-w-5xl mx-auto` column to be a direct child of `<main>` (added `mb-10` to
  preserve the old `gap-10` spacing). Event cards stay in the centered column.
- `src/app/(authed)/events/[slug]/page.tsx`: same move — logo/nav `<header>` out
  of the `max-w-2xl mx-auto` column (added `mb-8`). The event title/content
  `<header>` stays centered inside the column.

### Potential concerns to address:
- The previous chrome PR (#250) moved /events into the `(authed)` group for the
  fixed top-right admin/login bar; this PR is the complementary left-alignment
  fix. Both were needed to fully match /profile.
- If a future page adds the shared header, copy the /profile pattern: header is a
  full-width direct child, content gets its own centered max-w container.
