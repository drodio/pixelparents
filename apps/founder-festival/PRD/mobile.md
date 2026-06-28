## Progress Update as of 2026-05-26 06:18 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry for the `mobile` branch. Did a full mobile-optimization pass on the
public + authed (non-admin) site so it renders cleanly on a modern iPhone
viewport (390×844), using mobile-first responsive Tailwind so every viewport
≥640px (`sm:`) is byte-identical to the prior desktop layout. Admin was
explicitly out of scope.

### Detail of changes made:
- **Strategy:** mobile-first responsive. Existing classes were kept as the
  desktop (`sm:`) variant and a mobile-friendly base class added beneath, so
  desktop ≥640px is unchanged. Verified with desktop (1280px) screenshots.
- **`src/app/layout.tsx`** — added an explicit `viewport` export
  (`width=device-width, initialScale: 1`; Next was emitting only
  `width=device-width`, which lets iPhones zoom out on load) and a dark
  `themeColor` (`#151515`) for mobile browser chrome.
- **`src/components/LeaderboardTable.tsx`** — biggest offender (overflowed
  ~665px at 390px). Extracted a shared `NameCell`, kept the desktop `<table>`
  byte-identical behind `hidden sm:table`, and added a `sm:hidden` mobile card
  list: rank, avatar, name, company, badges, and a 3-up Founder/Investor/
  Combined score row with the active tab highlighted. Uses two refs
  (desktop row + mobile card) and scrolls whichever is visible for the
  `?e=` highlight behavior.
- **`src/components/Recommendations.tsx`** (profile page; overflowed ~71px) —
  the priority rows (category + text + 1–4 rating buttons, plus a ✕ on custom
  rows) now stack vertically on mobile via `flex-col sm:flex-row`. Rating
  buttons + ✕ grouped so they stay on one line when stacked; `gap-1` matches
  the old `ml-1` so desktop spacing is unchanged.
- **`src/components/AccountSetupForm.tsx`** — tightened the notification-prefs
  grid column gap on mobile (`gap-x-3 sm:gap-x-6`) so labels get more room.
- **`src/app/(authed)/dashboard/page.tsx`** — mobile padding consistency
  (`px-6 sm:px-8`).
- **Already mobile-ready, left unchanged (verified):** splash, events landing +
  apply, developers (code blocks scroll internally), claim page + ClaimProfileModal
  (live-tested), Score-detail modal (live-tested), privacy, chatham, verified,
  not-this-round, and the account email/phone card internals.

### How it was verified:
- Headless Chrome (Playwright, iPhone 390×844 UA) screenshots of all public
  routes; horizontal-overflow probe reports `overflowX=0` on all 13 public
  routes (was 665px leaderboard, 71px profile).
- Desktop (1280px) regression screenshots of leaderboard, profile, and
  recommendations confirm no change.
- `tsc --noEmit` passes. No new lint errors (the lone hit is the pre-existing
  repo-wide `<a href="/">` / `no-html-link-for-pages` pattern).

### Potential concerns to address:
- Auth-gated pages (`/account`, `/account/setup`, `/dashboard`) sit behind
  Clerk and could not be live-screenshotted headless; they were verified by
  code review + typecheck. Their wrappers are clean and the form is
  flex / `grid-cols-1 md:grid-cols-2`-based, so they should be sound — worth an
  eyeball on a real signed-in phone.
- `.env.local` was copied from the main checkout into this worktree so the dev
  server could render pages (gitignored; not committed).
- Admin was intentionally skipped — its wide tables and inline nav still need a
  mobile pass in a future branch.
