# PRD — event-page-nav-polish

## Progress Update as of 2026-06-08 11:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Three event-recap UX tweaks (no schema/migration):
1. Attendee **name** in the public AttendeesTable now renders **gold + bold** (`text-[#dfa43a]`),
   matching the leaderboard's gold name; company stays `text-zinc-400` (also leaderboard-faithful).
2. The "Past Event: <date>" pill is now a **gold-outlined** pill inside a **mini-carousel**:
   faded preview pills of the previous/next past events with ‹ / › carats, wrapping around so
   there's always a left + right option (`EventRecapNav`).
3. **"Events"** in the top nav is now **clickable on event detail pages** (links straight to the
   public `/events` list for everyone) via a new `eventsAsLink` prop on `SiteHeaderNav`.

### Detail of changes made:
- `src/components/events/AttendeesTable.tsx`: name span → `font-bold text-[#dfa43a]`.
- `src/components/events/EventRecapNav.tsx` (new): gold current pill + ‹/› carats + masked,
  faded preview pills (~70% shown via `mask-image` gradient); side pills `hidden sm:block`.
- `src/app/(authed)/events/[slug]/page.tsx`: computes prev/next from `listPastEvents()` with
  wraparound; renders `EventRecapNav`; passes `eventsAsLink` to `SiteHeaderNav`.
- `src/components/SiteHeaderNav.tsx`: `eventsAsLink` prop — Events renders as a link to `/events`
  (not the inert current-tab span), bypassing the claim-gate since `/events` is public.

### Potential concerns to address:
- Company is left gray to match the leaderboard exactly; if DROdio wants the company gold too,
  flip the company span to `text-[#dfa43a]`.
- Built off latest origin/main (events route now lives under `(authed)/events`, public via its
  own gating). main is churning from other worktree sessions — merge promptly.
