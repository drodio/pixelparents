# worktree-mobile-audit-3007 — Mobile audit & responsive fixes

## Progress Update as of 2026-06-05 08:17 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Full mobile-responsiveness pass at a 390px phone viewport across the whole app. The user-facing side was already mostly responsive, so it got a few surgical fixes; the admin side got the structural work — a responsive nav and a layout change so wide data tables scroll inside their own boxes instead of blowing out the page width. No logic/behavior changes; responsive Tailwind classes only.

### Detail of changes made:
- **Admin nav is now responsive** (`src/components/admin/AdminNav.tsx`). The fixed `w-56` left sidebar (which ate half a phone screen) is now `hidden md:flex`. Below `md` it collapses to a sticky full-width top bar (wordmark + env pill + hamburger) that opens a slide-in drawer with the same RBAC-gated links. Drawer closes on link tap (clicks bubble up) — links are plain `<a>` full-page navs, so no `useEffect` needed. Desktop sidebar + mobile drawer share one `navLinks` JSX so they can't drift.
- **Admin layout** (`src/app/(authed)/admin/layout.tsx`): outer flex is now `flex-col md:flex-row` (top bar stacks above content on mobile, sidebar to the left on desktop). `<main>` gained `min-w-0` — the key fix: it lets the flex child shrink below content width so the wide tables scroll inside their `overflow-x-auto` wrappers instead of forcing a horizontal **page** scroll. Padding is now `px-4 sm:px-6 py-6 sm:py-8`.
- **ProfilesScoredTable** (the 16-col monster): already had `overflow-x-auto`. Made the top controls row (`Filter / Export CSV / Source / Badges`) `flex-wrap justify-start sm:justify-end` so it wraps on mobile instead of overflowing. Table scrolls horizontally inside its box — acceptable for a dense admin grid.
- **Wrapped previously-unwrapped admin tables in `overflow-x-auto`**: events list (`admin/events/page.tsx`), event applicant queue (`admin/events/[id]/page.tsx`, also `flex-wrap` on its status-tab row), spend detail cost table (`admin/spend/page.tsx`), admin-access requests (`AdminAccessTable.tsx`), and the credits ledger (`AdminCredits.tsx`).
- **AdminAccessTable** Actions cell: button groups are now `flex flex-wrap justify-end`, role `<select>` is `w-full sm:w-auto` so the select + 2–3 buttons stack instead of overflowing.
- **ApplicantRow**: name/contact block `min-w-0` + `truncate` on name/email so long values don't widen the cell.
- **RolesManager**: new-role input `w-full max-w-xs` (was `max-w-xs`) so it never exceeds a narrow viewport.
- **User-facing**: profile score display divider scales progressively (`h-16 sm:h-20 md:h-24`) and the row gap tightens to `gap-4` on the smallest screens so the big combined score + side scores breathe at 390px (`profile/page.tsx`). Developers page cost columns gap is now `gap-8 sm:gap-[50px]` instead of a hard `gap-[50px]`.
- Swept the rest of the user-facing components (Splash, AccountSetupForm, Leaderboard {Client,Table}, CredibilityRadar, FounderMatrix, Badges, events/[slug]) — already responsive, no changes needed.

### Verification
- `pnpm build` → "Compiled successfully". `eslint` clean on all changed files. (Two pre-existing lint findings in `profile/page.tsx:499` and `developers/page.tsx` `<img>` were left as-is — not introduced here, and prod already ships with them.)
- No browser/Playwright tooling in the repo, so visual 390px confirmation was done by Tailwind reasoning + build, not screenshots. The one spot worth a human glance is the profile score row with an extreme (5-digit) combined score next to 4-digit side scores at `gap-4`.

### Potential concerns to address:
- Admin dense tables still rely on horizontal scroll on mobile (no per-column hiding). That's the pragmatic call for an operator tool, but if mobile admin use grows, consider a card layout or `hidden`-on-mobile low-value columns (IP, Location) for the ProfilesScoredTable.
- The worktree was branched fresh from `origin/main` (PR #191), which was ahead of the local `main` checkout (PR #174) where the initial audit ran — all edits were re-verified against current file state, not the stale audit's line numbers.
