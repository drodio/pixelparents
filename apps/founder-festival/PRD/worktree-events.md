# PRD — worktree-events

## Progress Update as of 2026-06-05 05:06 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Reworked the "Find my LinkedIn" candidate rows on the homepage: each result now has a white **Check Score** button that scores that person directly (instead of clicking the name to drop their handle into the field), and the old "View" text is replaced by the LinkedIn icon (gray → LinkedIn-blue on hover) next to the existing gold external-link arrow; clicking that opens their LinkedIn.

### Detail of changes made:
- `FindHandleHelper.tsx`: prop `onPick` → `onScore`. Each row is now `[name/info][white "Check Score" button]` on the left half, and a right-side `<a>` (`group`) containing `FaLinkedin` (from `react-icons/fa`, `text-zinc-500 group-hover:text-[#0a66c2]`) + the gold `ExternalLinkIcon`, linking to the candidate's LinkedIn. Updated the helper hint copy. Name is no longer a button.
- `SplashForm.tsx`: extracted `runEvalForHandle(rawHandle)` from `submitUrl` (form submit now just calls it). New `handleScoreCandidate` sets the handle, closes the helper, and runs the eval immediately — wired to `onScore`. The eval overlay (`evaluating`) takes over the screen as before.

### Verification done:
- `next build` compiles + typechecks; ESLint clean on both files (only the pre-existing `<img>` warning). Homepage `/?home=1&name=…` renders 200.

## Progress Update as of 2026-06-05 04:58 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Arriving at the homepage via the "Score them now" (`?name=`) flow now auto-scrolls the "Find my LinkedIn" helper into view, so the visitor lands on the candidate results instead of the headline/handle input above them.

### Detail of changes made:
- `SplashForm.tsx`: added `helperRef` + `scrollToHelperRef`. The `?name=` mount effect sets `scrollToHelperRef`, and a new effect scrolls the helper into view (`scrollIntoView({ block: "start" })`, deferred a frame) once it opens — only for the `?name=` arrival, not manual "Help me find my LinkedIn handle" clicks. Wrapped the helper in a `ref`'d `div.scroll-mt-4` for a little top breathing room.

### Verification done:
- `next build` compiles + typechecks; ESLint clean on `SplashForm.tsx` (only the pre-existing `<img>` warning).

## Progress Update as of 2026-06-05 04:50 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Round of refinements on top of the PR #182 work, all from DROdio feedback: shrunk the header search to a magnifying-glass + "Search..." input, left-justified its dropdown, fixed a missing space in the "Score them now" copy, fixed "Score them now" not actually reaching the homepage scoring flow, moved the Credibility section above the matrix on the profile page, and renamed "Founder/Investor Matrix" → "Relationship Matrix" with a Founder/Investor toggle when the profile scored on both.

### Detail of changes made:
- **Header search UI** (`HeaderSearch.tsx`): desktop input is now compact (`w-36 lg:w-44`) with a magnifying-glass icon inside on the left and placeholder "Search..." (was the full-width "Search Founders & Investors"). Mobile overlay placeholder also "Search...". Dropdown now anchors `left-0` (was `right-0`) so its left edge aligns with the search box and extends rightward.
- **ScoreThemPrompt spacing** (`ScoreThemPrompt.tsx`): the name span and "isn't" were rendering joined ("Jonesisn't"). Made the space explicit with `{" "}`.
- **"Score them now" navigation** (`src/lib/score-them.ts`): `scoreThemHref` now returns `/?home=1&name=…` (was `/?name=…`). The homepage (`src/app/(authed)/page.tsx`) redirects a signed-in, already-claimed user straight to their `/profile` UNLESS `?home=1` is present — so without it the scoring link bounced claimed users (e.g. DROdio) away before the find-LinkedIn helper showed. Added a test asserting `home=1` is present; updated the exact-URL expectations.
- **Profile section order** (`profile/page.tsx`): the Credibility `<section>` now renders before the matrix (was matrix-then-credibility).
- **Relationship Matrix + toggle** (`FounderMatrix.tsx` rewritten as a client component; `profile/page.tsx`): title is now "Relationship Matrix" for both dimensions. Component takes `founder` + `investor` `MatrixResult | null` and a `defaultDimension`; shows a Founder/Investor toggle (same styling as `CredibilityRadarSection`) only when both are present, defaulting to the dominant dimension. The page now computes both matrices via a `buildMatrix(dim)` helper sharing one `getMatrixCandidates()` call. Section keeps `id="founder-matrix"` so existing cross-profile `#founder-matrix` anchor links still resolve.

### Verification done:
- `next build` — compiles, TypeScript passes.
- `vitest run tests/lib/score-them.test.ts` — 9/9 pass.
- Live smoke tests on :3004: profile page 200 and serves "Credibility" before "Relationship Matrix" (byte-offset check); `/?home=1&name=…` serves the splash with 0 redirects; search API + no-match path unchanged.

### Potential concerns to address:
- The `?home=1` redirect-bypass is reused for the scoring link; if homepage redirect logic changes, keep that contract in mind (documented in `score-them.ts`).
- Matrix now computes BOTH dimensions when a profile scored on both (was just the dominant) — slightly more work per profile render, but reuses one candidate fetch. Fine in practice.
- Still pending a real browser eyeball of: the magnifying-glass input sizing in the live header, the left-justified dropdown alignment, and the Relationship Matrix toggle interaction.

## Progress Update as of 2026-06-05 04:32 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Implemented four related changes: (1) hide the "Are you {name}? Claim this profile…" CTA once a profile is claimed by anyone; (2) a global header search box ("Search Founders & Investors") right of the Events nav item, with a typeahead dropdown of matching profiles; (3) a shared "Score them now" prompt shown when a name isn't on the leaderboard, which deep-links to the homepage with the name pre-filled to run the find-my-LinkedIn flow; (4) the leaderboard's own search empty state now uses that same "Score them now" prompt instead of "No scored entries yet".

### Detail of changes made:
- **Part 1 — claim CTA gating** (`src/components/ScoreTable.tsx`, `src/app/(authed)/profile/page.tsx`): added an optional `isClaimedByAnyone` prop to `ScoreTable` and changed the CTA gate from `!isOwner` to `!isOwner && !isClaimedByAnyone`. The profile page already computes `isClaimedByAnyone` (`isOwner || !!primaryClaim`) and now threads it down. CTA now shows only on *unclaimed* profiles to non-owners.
- **Part 4 — shared prompt + homepage entry**:
  - New `src/components/ScoreThemPrompt.tsx`: presentational (no client hooks) — renders "`{Name}` isn't on our Leaderboard yet. [Score them now]". The link goes to `/?name=<encoded>`.
  - New `src/lib/score-them.ts`: the `?name=` contract shared by writer + reader — `scoreThemHref(name)` and `parseNameParam(search)` (returns trimmed name only when ≥ `MIN_SCORE_NAME_LENGTH` = 2). Tested in `tests/lib/score-them.test.ts` (8 cases, all passing).
  - `src/components/FindHandleHelper.tsx`: accepts `initialName`; extracted `runSearch(name, company)`; auto-runs the Exa `/api/find-handle` search once on mount when `initialName` is ≥2 chars (ref-guarded against StrictMode double-mount).
  - `src/components/SplashForm.tsx`: on mount reads `parseNameParam(window.location.search)` (avoids `useSearchParams` Suspense requirement); if present, pre-fills + opens the helper. Passes `initialName` to `FindHandleHelper`.
- **Part 2 — global header search**: new `src/components/HeaderSearch.tsx`, rendered in `SiteHeaderNav` just right of "Events". Desktop = full input; mobile = search icon that expands to a full-width overlay. Debounced (220ms, ≥2 chars) typeahead hits the existing `/api/leaderboard/search?q=` with no filters (defaults → role=both, combined sort). Dropdown rows (avatar + name + company + combined score) link to `profileHref`. No matches → `ScoreThemPrompt`. Closes on outside-click / Escape.
- **Part 3 — leaderboard empty state** (`src/components/LeaderboardTable.tsx`, `LeaderboardClient.tsx`): `LeaderboardTable` now takes `searchQuery` + `searchLoading`. When a search settles with zero rows it renders `ScoreThemPrompt`; while loading it stays quiet; with no active query it keeps the original "No scored entries yet." `LeaderboardClient` passes `searchQuery={inSearch ? query : ""}` and treats the pre-debounce/in-flight window as loading to avoid a flash.

### Verification done:
- `next build` — compiles successfully, TypeScript passes, all routes generated.
- `npx vitest run tests/lib/score-them.test.ts` — 8/8 pass.
- Full suite (`vitest run --no-file-parallelism`): 712 pass, 4 fail. The 4 failures (`eval-pipeline.test.ts`, `redeem.test.ts`, `select-top-profiles.test.ts`) are **pre-existing** — they reproduce identically on the stashed (≈origin/main) tree without these changes. They are DB/scoring-state dependent, unrelated to this UI work.
- ESLint on all changed files: clean except a pre-existing `no-html-link-for-pages` error on the profile-page logo link (`<a href="/?home=1">`, untouched) and pre-existing `<img>` LCP warnings.

### Potential concerns to address:
- **Not yet visually verified in a browser** — the dev server was stopped to run `next build`. Header search dropdown, mobile expand/collapse overlay, and the `/?name=` homepage auto-run flow should be eyeballed on a running instance (was on :3004).
- **Header real estate**: the desktop search input is `w-52 lg:w-72`. On mid-width viewports (≈640–1024px) the nav row (logo + 4 links + input) could get tight; worth a visual check. Mobile uses the icon/overlay so phones are fine.
- **Two search boxes on `/leaderboard`**: the global header search and the leaderboard's own inline search now coexist (by design). They hit the same API; just noting the redundancy in case it reads oddly.
- **`/?home=1` vs `/?name=`**: the homepage logo already uses `?home=1`; the new `?name=` param is independent. No collision, but both now drive homepage query-param behavior — keep in mind if more params are added.
