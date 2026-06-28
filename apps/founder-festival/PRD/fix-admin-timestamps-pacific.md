## Progress Update as of 2026-05-28 01:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed admin timestamps (e.g. "Date Scored" in the profiles table) rendering in UTC instead of Pacific. They now display in `America/Los_Angeles` consistently.

### Detail of changes made:
- Root cause was in `src/components/LocalTime.tsx`. Despite its name, the component set `suppressHydrationWarning`, which tells React to KEEP the server's first render and NOT patch it on hydration. On Vercel the server TZ is UTC, so the displayed value stayed UTC (e.g. 8:22 PM UTC shown while it was 1:22 PM PDT) and never updated to the viewer's clock.
- Rewrote `LocalTime` to format with an explicit locale + timeZone: `d.toLocaleString("en-US", { dateStyle, timeStyle, timeZone })`, defaulting `timeZone` to `"America/Los_Angeles"`. Added an optional `timeZone` prop to override per-use. Removed `suppressHydrationWarning` and the `"use client"` directive since the render is now deterministic (server and client produce identical output).
- `LocalTime` is used only in admin surfaces: `ProfilesScoredTable.tsx` (Date Scored), `RunsPanel.tsx` (scoring-run timestamps), and `AdminCredits.tsx` (credit grant times). All three now show Pacific. No public-facing usages.
- Verified: `next build` reports "Compiled successfully" + TypeScript pass; ESLint clean on the changed file. (Local build then fails at page-data collection only because `.env.local` has a placeholder `DATABASE_URL`; unrelated to this change — prod has real env.)

### Potential concerns to address:
- The repo had a pre-existing convention assumption that `LocalTime` rendered in the *viewer's* timezone. That never actually worked (the hydration suppression froze it on UTC). If a future need arises to show viewer-local time, pass `timeZone` explicitly or reintroduce a client-only effect-based render — don't rely on `suppressHydrationWarning`.
- Pre-existing `tsc --noEmit` reports 3 `LayoutProps` "Cannot find name" errors in layout files; these are Next.js 16 generated globals that only resolve after `.next/types` is built (a full `next build` clears them). Not introduced by this change.
