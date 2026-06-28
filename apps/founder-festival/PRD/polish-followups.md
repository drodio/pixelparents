# Branch: `polish-followups` — progress log

Branched from `main` (post PR #22). Follow-ups on the polish/admin PR
based on QA feedback.

## Progress Update as of 2026-05-25 9:58 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Four fixes from QA:
1. "Profile Claimed" pill was wrapping below the name on the
   leaderboard instead of staying inline → removed `flex-wrap` on
   the name/pill row, added `truncate` on the name span and
   `shrink-0` on the pill so it sits to the right and the name
   ellipses if anything has to give.
2. Confidence circle tooltip on hover was using the native HTML
   `title` attribute, which only fires after a ~1.5s browser delay
   → replaced with an immediate-hover Tailwind bubble that pops up
   above the circle with a black background, white text, on hover.
3. `<em>Are you {firstName}?</em>` was italic per the `<em>` semantic;
   the user wanted bold → switched to `<strong>`.
4. The Claim Your Profile modal opened from `UnclaimedNotice`,
   `EventsCTA`, and `Recommendations` didn't get the `firstName` prop,
   so the personalized "{firstName}, claim your profile" header only
   appeared when the ScoreTable CTA opened the modal. Threaded
   `firstName` through all three call sites + the welcome page.

Also synced the re-scored data from the prod Neon branch back to dev
(localhost) so the confidence circle UI on localhost matches what's
on festival.so:
- Updated 14 evaluation rows on dev (scores + breakdown JSON + summary
  fields)
- Replaced 101 score_items rows on dev (real AI confidence values
  instead of the default 50)

### Detail of changes made:
- `src/components/ScoreTable.tsx`:
  - New `CircleTooltip` component, positioned absolutely above the
    circle, visible on `group/circle-hover`. Replaces native `title`.
  - All three circle variants (confirmed, pending, scored) now wrap
    in `<span class="relative group/circle">` so the tooltip can
    position relative to the circle.
  - `<em>` → `<strong>` in the non-owner CTA.
- `src/components/LeaderboardTable.tsx`:
  - Removed `flex-wrap` from the name row. Added `truncate` on the
    name span and `shrink-0` on the "claimed" pill + "you" label so
    they stay inline.
- `src/components/UnclaimedNotice.tsx`, `EventsCTA.tsx`,
  `Recommendations.tsx`:
  - Each gains an optional `firstName` prop that gets passed straight
    through to `ClaimProfileModal`. No other behavior changes.
- `src/app/(authed)/welcome/page.tsx`:
  - Computes `firstName` once and passes to all four call sites
    (ScoreTable, UnclaimedNotice, EventsCTA, Recommendations).

### Operator (Daniel) follow-up:
- The prod → dev sync ran once. If we re-score on prod again, dev
  will drift; re-run the same script (or pull into a helper if this
  becomes routine).

### Potential concerns to address:
- `CircleTooltip` uses Tailwind's `group/circle-hover` scoped group.
  If we ever wrap the row in another `group` we should keep the names
  distinct.
- The leaderboard row will horizontally overflow on very narrow
  viewports if name + company + pill don't fit. `truncate` on the
  name span handles it but might cut "Daniel Rubén Odio, Storytell"
  into "Daniel Rubén Odi…". Acceptable.
