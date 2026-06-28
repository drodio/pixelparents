## Progress Update as of 2026-06-03 04:01 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Resolved merge conflicts after pulling fresh main into the branch — main moved a lot since the PR opened (admin-profile-box, leaderboard-pagination, score-commas, neo-investor-enricher, etc.) Two conflicts in `src/app/(authed)/profile/page.tsx` and `src/components/LeaderboardClient.tsx`; `LeaderboardClient.tsx` auto-merged cleanly, profile page needed manual resolution. No content changes from my side.

### Detail of changes made:
- `src/app/(authed)/profile/page.tsx`: my P1 fix #3 wrapped `ScoreDetailButton` in `<div className="hidden sm:flex">` inside `<header>`. Main extracted it into a separate floating `AdminProfileBox` component rendered OUTSIDE the header (fixed top-right, super-admin-only, minimizable). Resolution: drop my HEAD block entirely — main's structure already removes the header collision I was trying to solve. My header-gap tightening (`gap-3 sm:gap-6`) is preserved at line 459.
- `src/components/LeaderboardClient.tsx`: auto-merged. Main rewrote this for cursor pagination + separate search API (`/api/leaderboard/page`, `/api/leaderboard/search`). My placeholder copy, drawer ✕ size, and `hideHeading` prop wiring all survived intact (verified via grep).
- `pnpm exec tsc --noEmit` clean post-merge.

### Potential concerns to address:
- `AdminProfileBox` is also `fixed top-3 right-3` and overlaps with the layout's now-flowing chrome row on mobile. But it's super-admin-only (operator/me), so production users will never see it. Acceptable trade-off.

---

## Progress Update as of 2026-06-03 03:46 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
EventsCTA copy tweak so the gold CTA on `/profile` fits on a single line at 390px instead of wrapping to two.

### Detail of changes made:
- `src/components/EventsCTA.tsx`: button copy `"Show me the Founder Festival events I qualify for"` (50 chars, wrapped to 2 lines on iPhone) → `"Show me Founder Festival Events I Qualify For"` (46 chars, single line). Drops the leading `the` and title-cases per request. Verified at 390px: button measures 356×48 with `line-height: 20px` (single line).
- Updated the matching descriptor comment at top of the file.

### Potential concerns to address:
- Title-case capitalization is intentionally noun-phrase styling. Some style guides prefer sentence case for buttons — the user's wording is explicitly title case so we match.

---

## Progress Update as of 2026-06-03 03:21 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Mobile audit of front page (splash), `/leaderboard`, and `/profile/[handle]` at iPhone 13 viewport (390×844). Eight files touched to fix the issues that the audit surfaced — no horizontal overflow regressions, no desktop changes. Focused on three buckets: (1) the floating `UserBadge` covering content as users scrolled, (2) cramped/truncated UI at 390px, (3) sub-44px tap targets on the recommendations row.

### Detail of changes made:
- **`src/app/(authed)/layout.tsx`**: chrome wrapper (Admin link + `UserBadge`) was `fixed top-3 right-4 z-50` on every viewport. As users scrolled `/leaderboard` cards or `/profile` content it sat ON TOP of the right edge, hiding the Combined score column and the page-header SCORE DETAIL button. Now the wrapper is `flex justify-end px-4 pt-3` on mobile (normal flow at top of page) and only switches to `sm:fixed sm:top-3 sm:right-4` on `sm+`. Mobile users see a 44px-tall row above the page header; desktop is byte-identical to before.
- **`src/components/LeaderboardClient.tsx`**: search placeholder `"Search by name, company, or LinkedIn"` rendered as `"Search by name, company, or L"` at 390px (filter pill ate the row). Shortened to `"Search name or company"`. Drawer close ✕ was 43×16; now 40×40 with `inline-flex items-center justify-center w-10 h-10`. Drawer also now passes `hideHeading` to `LeaderboardFilters` to kill the double-`Filters` label.
- **`src/components/LeaderboardFilters.tsx`**: new optional `hideHeading` prop. When set, the inner `<h2>Filters</h2>` is suppressed and the "Clear all (N)" link still renders on its own. Desktop sidebar unchanged.
- **`src/app/(authed)/profile/page.tsx`**: (1) `ScoreDetailButton` container is now `hidden sm:flex` — the dev/super-admin debug surface fought the Profile/Leaderboard/Events nav at 390px and is not user-facing. (2) The score-CTA row (`#N on Leaderboard` pill + `Re-Score Me` link) is now `flex flex-col sm:flex-row gap-1.5 sm:gap-3` so the two pieces stack cleanly on mobile instead of dropping `Re-Score Me` to a wrapped second line.
- **`src/components/SplashHome.tsx`**: tagline used to render only line 1 until the visitor tapped/focused to reveal lines 2–3. On mobile that's a hidden value prop. Now the full 3-line tagline is visible by default on mobile (`opacity-100`); the desktop click-to-reveal fade is preserved via `sm:opacity-[var(--fade)]` wired to a CSS variable set from the focused state. `sm:cursor-pointer` only applied on desktop now.
- **`src/components/SplashForm.tsx`**: "Have an invite code?" button was `text-xs` with no padding (≈16px tall). Added `px-3 py-2 -my-2` so the tap target clears 40px while keeping the visual baseline identical.
- **`src/components/Recommendations.tsx`**: `RatingButtons` 1-2-3-4 were `w-7 h-7` (28×28) everywhere. Now `w-9 h-9 sm:w-7 sm:h-7` (36×36 mobile, original 28×28 desktop). `PrivacySlider` `px-2 py-1 text-[10px]` → `px-3 py-2 sm:px-2 sm:py-1` with `text-xs sm:text-[10px]`. Custom-row remove ✕ was inline 16×16; now `w-9 h-9` on mobile, original sizing on desktop.
- **`src/components/FounderMatrix.tsx`**: "Most Like You / Most Complimentary / Least Like You" column headings were `text-[11px]` — under Tailwind's `text-xs` floor. Bumped to `text-xs` (12px) for legibility.

### Pre-audit findings (read before changes):
Inspected at 390×844 in headless Chrome (iPhone 13 device descriptor). Captured pre-fix screenshots at `/tmp/ff-mobile-audit/{splash,leaderboard,leaderboard-fopen,profile-joe}-{fold,full}.png` and scrolled positions. Zero horizontal overflow on any page at 390px (good — preserves what PR #86 + #89 shipped). Issues found, P0/P1/P2:
- P0: floating chrome overlap; truncated leaderboard search placeholder.
- P1: profile header density; Combined-score row wrap; splash tagline hidden behind tap-to-reveal on mobile; recommendations tap targets too small.
- P2: FounderMatrix h4 11px; drawer double-Filters heading; drawer ✕ close too small; invite-code button no tap area.

All addressed in this pass.

### Operational steps taken:
- Branch `mobile-audit-2026-06` cut from `origin/main` at `59d19bf`. Local dev DB (`ep-old-shadow`) was behind on `subject_city` column — ran `pnpm db:push --force` to apply migrations 0030/0031; safe because that DB is the developer's local environment, NOT prod (`ep-fragrant-surf`).
- Dev server on :3003 (`pnpm exec next dev -p 3003`); `pnpm dev -- -p 3003` does NOT work because pnpm passes `-p 3003` as a project arg to Next, which then tries to load directory `./-p`.
- `pnpm exec tsc --noEmit` clean. `pnpm lint` shows only pre-existing repo-wide errors/warnings (e.g. `@next/next/no-html-link-for-pages` for `<a href="/">` patterns, `<img>` warnings on splash). My edits introduced none.
- Post-fix screenshots at `/tmp/ff-mobile-audit/*-after.png` verify all targeted issues are resolved.

### Potential concerns to address:
- The `Developers` link in `SplashHome.tsx:14-19` is still `fixed top-3 left-4 z-50`. On mobile it visually overlaps the layout's new top chrome row but doesn't collide with content. Acceptable for now; revisit only if the splash gets another top-row element.
- `MismatchOverlayController` was not audited in this pass and the smallTaps report shows a stray `close ✕ 43×16` on `/profile` that's likely from that overlay. Not fixed here because it's only visible during a name-mismatch flow.
- `Badges` `+N` expander pills on leaderboard cards are 30×21 — intentionally compact for the card row. Left alone; they're a secondary affordance (the full card is tappable for the name).
- Dev-mode Next.js "N" indicator appears bottom-left in all dev screenshots; not a production concern, ignore.
- iPhone 13 (390px) is the canonical test viewport — older iPhone SE (320px) was NOT re-audited. Likely fine because nothing here narrowed below 320, but worth a spot-check if SE is in scope.
- The mobile layout chrome row adds ~44px to every (authed) page's top spacing. Splash content was centered with `justify-center` and shifts down ~22px relative to the viewport center. Visually still feels balanced in the screenshots.
