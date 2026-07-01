## Progress Update as of [June 30, 2026 — 6:50 PM Pacific]

### Summary of changes since last update
First entry on this branch. Fixed the app shell + dashboard + notifications
cluster from the automated audit (6 findings), plus two live-testing issues
(Explore grid missing Events/Resources; notifications subtitle claiming "all
caught up" while unread exist). All confirmed against the code before fixing;
none were skipped. tsc clean, lint clean, full test suite green (630 tests).

### Detail of changes made:
- **Finding 1 (dashboard-shell.tsx)** — signed-out "Create account" CTA pointed
  at `/sign-in?redirect_url=/dashboard`; now points at `/signup` (the real signup
  surface, matching the dashboard page's "Get started" link). Primary "Sign in"
  link unchanged.
- **Finding 2 (dashboard-shell.tsx)** — the mobile "More" drawer is a blocking
  modal but lacked dialog semantics and Escape-to-close. Added
  `role="dialog" aria-modal="true" aria-label="Navigation menu"` to the drawer
  panel, and an Escape keydown listener inside the drawer-open effect (registered
  alongside the existing body-scroll lock, torn down on close). Full focus-trap
  was left out (noted as a possible follow-up).
- **Finding 3 (dashboard-shell.tsx)** — the mobile top bar only rendered the
  logo + account avatar, so the unread badge was hidden on mobile unless the
  drawer was open. Added `<NotificationBell />` to the top bar's right-side
  cluster for authed users (its label is `hidden md:inline`, so on mobile it
  shows just the icon + corner badge).
- **Finding 4 (notifications-client.tsx)** — `TypeIcon` only handled 3 of the 5
  canonical types; `community_mention` and `board_contribution` fell through to a
  plain bell. Added `case "community_mention"` → new `AtGlyph` (circled @) and
  `case "board_contribution"` → new `BoardGlyph` (board/card). Default bell kept
  for truly-unknown future types.
- **Finding 5 (notification-bell.tsx)** — corner badge (cap 9 → "9+") and inline
  label pill (its own `count > 99 ? "99+" : count`) disagreed for counts 10–99.
  Both now derive from `formatUnreadBadge`: `badge = formatUnreadBadge(count)`
  for the tight corner, `pill = formatUnreadBadge(count, 99)` for the roomier
  pill. Pill now uses `pill.show` / `pill.label`. The differing caps are
  intentional and documented.
- **Finding 6 + live-test subtitle bug (notifications-client.tsx + lib/db/notifications.ts)**
  — extracted the header subtitle into a pure, testable `notificationsSubtitle(unread, total)`
  in `lib/db/notifications.ts` (co-located with the sibling pure helper
  `formatUnreadBadge`; that's also the only path the vitest include glob
  `lib/**/*.test.ts` picks up). It makes the three states explicit and guarantees
  the unread branch wins over "all caught up" (the live-test symptom). The
  empty-state copy now covers all sources: "Updates about your posts, connections,
  events, and boards show up here." (finding 6). Client calls the helper instead
  of an inline ternary.
- **Live-test: Explore grid (dashboard/page.tsx)** — added Explore `LinkCard`s for
  **Events** (IconCalendar, after Community) and **Resources** (IconBook, after
  Directory), matching the existing card style + icons and the sidebar's nav
  order. Imported `IconCalendar` and `IconBook`.
- **Tests** — extended `lib/db/notifications.test.ts`: a `notificationsSubtitle`
  block (unread-wins regression → never "caught up" while unread, the caught-up
  state, the all-sources empty copy, defensive coercion) and a finding-5
  regression asserting the bell's corner badge (cap 9) and label pill (cap 99)
  agree for the same value now that both route through `formatUnreadBadge`.

### Potential concerns to address:
- Finding 2 adds Escape + dialog semantics but not a full focus trap / initial
  focus move. Keyboard users can still tab into the background page behind the
  drawer. A follow-up could trap focus within the panel.
- `next build` was NOT run in the worktree (per directive). tsc + lint + vitest
  are green; a CI/full build should confirm the production bundle.
- The live-test "caught up while unread" symptom couldn't be reproduced from the
  committed ternary (which already branched unread-first); the fix hardens the
  logic into a single tested pure function so the state machine is unambiguous.
