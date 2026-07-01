## Progress Update as of [July 1, 2026 — 3:45 PM Pacific]

### Summary of changes since last update
First entry. Batch of four mobile/web UX fixes reported by Ansh from the mobile
web app: (1) the fixed mobile top bar sat under the phone camera/notch;
(2) `/community` looked empty because the board defaulted to the strict "Open"
status and the only live ask was `matched`; (3) the bottom tab bar exposed Events
in the middle slot instead of Resources; (4) the resource board card had a
click-dead-zone (the flex row's gap between title and upvote swallowed clicks
instead of opening the board). All four are fixed; typecheck/lint/tests/build all
green.

### Detail of changes made:
- **Top bar safe-area (#1).** Added three utilities to `app/globals.css`:
  `.pt-safe` (padding-top: env(safe-area-inset-top)), `.h-safe-top`
  (height: calc(3.5rem + inset)), `.pt-safe-nav` (padding-top: calc(3.5rem +
  inset)). In `components/dashboard-shell.tsx` the mobile `<header>` now uses
  `pt-safe h-safe-top` (was `h-14`) so its logo/bell/avatar sit BELOW the notch,
  and the scrolling content wrapper uses `pt-safe-nav` (was `pt-14`) to match the
  grown bar. Also added `pt-safe` to the "More" slide-in drawer panel so its close
  button clears the notch. No-ops on desktop/Android (env insets resolve to 0).
- **Community empty board (#2).** Added an `"active"` StatusFilter (open +
  matched — everything still LIVE) in `lib/exchange.ts`, made it the FIRST status
  tab and the board DEFAULT in `app/(authed)/community/exchange-board-client.tsx`
  (default state, the "Active" tab, the mobile "Clear all" reset, and the
  active-filter badge baseline all now key on "active"). This means a community
  whose only post is `matched` (the current real state — Daniel's accepted ask)
  no longer reads as an empty board. Resolved posts still drop out of the default.
  Added a lockstep unit test in `lib/exchange.test.ts` (29 pass).
- **Bottom tab Resources⇄Events (#3).** `MOBILE_PRIMARY_HREFS` in
  `components/dashboard-shell.tsx` changed from
  `["/dashboard","/community","/events","/directory"]` to
  `["/dashboard","/community","/resources","/directory"]`. Events remains fully
  reachable via the "More" drawer (it's still in `NAV`).
- **Full-card click (#4).** The community ask card was already a single
  `MotionLink` anchor (fully clickable — no change needed). The RESOURCE board
  card (`app/(authed)/resources/resources-client.tsx`) had the real dead zone:
  the top flex row `<div className="relative z-10 flex ...justify-between gap-3">`
  was z-10 above the `absolute inset-0` overlay link but WITHOUT
  `pointer-events-none`, so the empty gap between the title block and the upvote
  button ate clicks. Moved `pointer-events-none` up onto that flex row (and off
  the inner title div, which no longer needs it). The upvote wrapper keeps its
  `pointer-events-auto`, so upvoting still works and the rest of the card now
  opens the board. This completes what #140 intended.

### Potential concerns to address:
- The `env(safe-area-inset-top)` fix is only visually verifiable on a real
  notched device / iOS Safari with `viewport-fit=cover` (already set). Desktop
  preview shows 0 inset, so the header just renders at its normal 3.5rem height —
  correct, but the notch-clearance itself can't be seen in the desktop preview.
- Defaulting the board to "active" is a deliberate product call (show all live
  posts, hide resolved). If a future flow wants "Open only" as the landing view,
  flip the default back — the "Open" tab is still there.
