## Progress Update as of [June 30, 2026 — 7:34 AM Pacific]

### Summary of changes since last update
Second commit: Community board + Events calendar made phone-friendly, same
filter-sheet pattern as the directory, plus the Events month grid no longer
overflows on phones. Responsive-only; no logic changes; md+ untouched.

### Detail of changes made:
- **Community** (`app/(authed)/community/exchange-board-client.tsx`): the Asks /
  Offers / All kind tabs stay inline; the secondary controls (status, sort,
  show-expired, my-posts, expertise-tag chips) move into a `MobileSheet` behind a
  Filters button (active-count badge). Single source of state (one
  `secondaryControls` element, desktop inline OR mobile sheet, gated on a
  `matchMedia(max-width:767px)` watcher). Sheet footer: Clear-all + "Show N posts".
- **Events** (`app/(authed)/events/events-calendar-client.tsx`): place +
  OHS-calendar filters move into a `MobileSheet` (calendar/list toggle stays
  inline). The 7-col month grid is now wrapped in `overflow-x-auto` with a
  `min-w-[560px] sm:min-w-0` inner track, so on phones it scrolls horizontally
  with usable cells instead of crushing to ~50px columns; fits with no scroll at
  sm+. Cell min-height trimmed to 80px on phones (92px at sm+).

### Potential concerns to address:
- Turbopack `next build` cannot run in this worktree because node_modules is a
  cross-filesystem symlink ("Symlink ... points out of the filesystem root").
  Verified the build by copying changed files into the main checkout
  (/Users/main/stanfordohs/pixelparents) and running `next build` there, then
  restoring main pristine. tsc/lint/test pass in-worktree.

## Progress Update as of [June 30, 2026 — 7:21 AM Pacific]

### Summary of changes since last update
First commit on `feat/w4-mobile`: the cross-platform / phone-friendly (responsive)
wave. Made the app shell phone-native (mobile top bar + bottom tab bar + slide-in
"More" drawer) and moved the dense directory filter row into a mobile bottom
sheet. All changes are responsive-only (Tailwind breakpoints) and desktop-safe —
nothing about data/logic changed, and md+ layouts are byte-for-byte the same.

### Detail of changes made:
- **Global / viewport** (`app/layout.tsx`, `app/globals.css`): added a Next
  `viewport` export with `viewportFit: "cover"` + dark `themeColor`, and
  `.pb-safe` / `.h-safe-nav` / `.pb-mobile-nav` safe-area utilities (iOS home
  indicator). No-ops on desktop/Android (env() insets resolve to 0).
- **App shell** (`components/dashboard-shell.tsx`): rewritten. Desktop sidebar is
  now `hidden md:flex` (unchanged at md+). Phones get: a fixed top bar (logo +
  account avatar / sign-in), a fixed bottom tab bar with the 4 primary tabs
  (Dashboard/Community/Events/Directory) + a "More" button, and a right slide-in
  drawer exposing EVERY nav item (labelled), the notification bell, account, and
  the verified badge — so the icon rail's hidden labels are never a dead end.
  Body scroll locks while the drawer is open; drawer closes on navigation.
  Content offset is `pt-14 md:pl-60` + `pb-mobile-nav` so nothing hides behind
  the tab bar. Tap targets ≥ 44px (min-h-[3.25rem] tabs, h-10 buttons).
- **Notification bell** (`components/notification-bell.tsx`): added an optional
  `showLabel` prop so the bell reads "Notifications" inside the mobile drawer
  while staying icon-only on the desktop rail (default unchanged).
- **Icons** (`components/icons.tsx`): added `IconMenu` (hamburger) + `IconFilter`
  (sliders).
- **Mobile sheet** (`components/mobile-sheet.tsx`, NEW): reusable bottom sheet
  (backdrop + slide-up panel, max-h-[85dvh], internal scroll, Escape-to-close,
  body-scroll lock, sticky footer slot). `md:hidden`. Shared by filter surfaces.
- **Directory** (`app/(authed)/directory/showcase-client.tsx`): the dense
  secondary filter row (sort, direction, per-row, age, radius, interest chips)
  now lives inline on md+ and inside a `MobileSheet` on phones, behind a
  "Filters" button (with an active-filter-count badge) next to the always-inline
  search box. Single source of state — the same `secondaryControls` element is
  rendered in exactly one place at a time (desktop inline OR mobile sheet) keyed
  on viewport width, so there's never a duplicate control in the DOM. Sheet
  footer has Clear-all + "Show N members". Also: the 1-column "wide" card now
  stacks its hero on top (full-width 16:10) on phones and switches to the
  side-by-side thumbnail at sm+, so it no longer cramps at ~375px.

### Potential concerns to address:
- Events month calendar (7-col grid) + Community filters-in-a-sheet still TODO in
  this same branch (next commits).
- The bottom tab bar shows 4 primary tabs; if NAV order changes,
  `MOBILE_PRIMARY_HREFS` in dashboard-shell.tsx must be kept in sync.
- Verify on a real ~390px viewport before PR (preview attempted at end of wave).
