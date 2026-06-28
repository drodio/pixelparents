# PRD — leaderboard-tweaks

## Progress Update as of 2026-06-05 08:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
De-rounded pills site-wide to match the leaderboard row badges (DROdio: "look at how the badges are on the leaderboard. That's what I want all the pills to be like" — i.e. `rounded-md`). Converted pill-shaped `rounded-full` chips/tags/status-pills/count-badges/pill-buttons and the two `rounded-lg` toggle containers to `rounded-md`, leaving genuinely-round elements alone.

### Detail of changes made (13 files, 15 class swaps):
- `rounded-full` → `rounded-md` on pills: `LeaderboardActiveFilters` active-filter chip; `LeaderboardClient` facet count badge; `ScoreTable` Pending + Admin + pending-add tags (lines with `bg-[#dfa43a]` and `bg-purple-600/30`); `profile/page.tsx` tkmx badge; `ReScoreButton` cta button; admin pills (`AdminAccessTable`, `NewJobForm`, `RunsPanel`, `RolesManager`, `PendingItemRow`, `AdminDeleteButton`).
- `rounded-lg` → `rounded-md` on toggle containers: `CredibilityRadarSection` and `FounderMatrix` (the Founder/Investor segmented toggles — now match the leaderboard role/sort toggles which were already `rounded-md`).
- **Kept round (not pills):** avatars (`Avatar`), confidence circles + "+" add button (`ScoreTable` `bg-green-600`/confidence/`border-dashed`), the on/off switch (`AccountSetupForm`), the eval spinner + step dot (`EvalProgress`), progress bars (`JobLiveProgress`, `CredibilityRadar`), and the active-filter chip's "×" remove button (`LeaderboardActiveFilters:98`).
- Edits applied via targeted `sed` on distinctive class substrings (the Edit tool required re-reading 13 files after the branch switch); verified the resulting diff is exactly the 15 intended swaps with no collateral.

### Verification done:
- `next build` compiles + typechecks. Post-sweep `grep rounded-full` returns only the 12 keep-round elements.

### Potential concerns to address:
- "Pills" was scoped to chips/tags/status-pills/count-badges/pill-buttons/segmented-toggle-containers. Cards/panels/modals using `rounded-lg`/`rounded-xl` were intentionally left (not pills). If DROdio wants those squared too, that's a follow-up.

## Progress Update as of 2026-06-05 07:46 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Two DROdio UI requests: (1) the leaderboard founder/investor counts subtitle is now larger (~70% of the title), with bold numbers, and the counts react to active facet filters ("83 Founder and 43 Investor Profiles match your filters" vs the total when unfiltered); (2) the Founder Festival logo on the scoring + re-scoring progress screens is centered, ~30% larger, and clickable to the home page, with the same larger size applied to the `/chatham` and `/privacy` content subpages. A third request — de-rounding pills site-wide — is pending a target-radius decision from the user.

### Detail of changes made:
- **Leaderboard subtitle** (`src/lib/leaderboard.ts`, `src/app/(authed)/leaderboard/page.tsx`):
  - `getLeaderboardCounts(filter?)` now optionally applies the active facets: it ANDs `baseWhere` with `buildLeaderboardWhere(filter)` so the counts reflect the filtered set. Role isn't applied (the founder/investor split already *is* the role distinction).
  - The page passes `filter` to `getLeaderboardCounts` and computes `filtersActive = buildLeaderboardWhere(filter) !== undefined` (true only when a stage/outcome/raised/team/badge facet is set — role-only changes don't flip it, since they don't change the counts).
  - Subtitle `<p>` is now `text-xl sm:text-2xl` (was `text-sm`), the two numbers are wrapped in `<strong className="font-bold text-zinc-100">`, and the copy appends " match your filters" when `filtersActive`.
- **FF logo** (`SplashForm.tsx` scoring overlay, `ReScoreButton.tsx` re-scoring overlay, `chatham/page.tsx`, `privacy/page.tsx`):
  - Scoring + re-scoring overlays: logo wrapped in `<a href="/?home=1" className="self-center …">` (centered + clickable) and resized `w-12 sm:w-14` → `w-[72px]` (~30% larger).
  - `/chatham` + `/privacy` (already centered + clickable): bumped `w-[68px]` → `w-[72px]` to match the "same larger size".
  - Standard logo size for these screens is now `w-[72px]`.

### Verification done:
- `next build` compiles + typechecks.
- Live (:3004): `/leaderboard` shows bold "42 Founder / 30 Investor" with no suffix; `?stage=seed` → "6 / 4 … match your filters"; `?raised_min=1000000` → "31 / 25 … match your filters". (Local dev DB counts are smaller than prod's ~838/438.)

### Potential concerns to address:
- The new logo `<a href="/?home=1">` links trip ESLint's `no-html-link-for-pages` — but this is the **established codebase pattern** for logo links (chatham/privacy/leaderboard/profile all use it) and `next build` / prod deploy tolerate it. Kept for consistency rather than introducing a one-off `<Link>`.
- "Subpages like /chatham" was scoped to `/chatham` + `/privacy` (the exact centered-clickable-logo pattern). Other logo-bearing pages (`/developers`, `/events/[slug]`, `/account/setup`, admin gates) were left as-is — extend if desired.
- Filter-reactive subtitle reacts to FACET filters (which navigate + re-SSR), not the client-side search box (which shows its own "N matches" count).
- **Pending:** de-round-pills-site-wide request — awaiting the user's target radius before sweeping.
