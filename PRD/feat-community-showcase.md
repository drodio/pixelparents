# feat/community-showcase

## Progress Update as of June 29, 2026 — 10:36 PM Pacific

### Summary of changes since last update
First entry. Merged the two near-identical authed pages `/directory` (family
cards + filters) and `/community` (world map + stats) into ONE consolidated,
filterable showcase at `/community`. Clicking a member now opens their full
profile IN-TAB at the new nested route `/community/[token]` (rendered inside
`DashboardShell`) instead of jumping out to `/p/[token]`. Added student-account
coarsening for minor privacy, opt-in (default-OFF) LinkedIn/GitHub links, and
skillset chips. `/directory` is now a permanent redirect to `/community`, and the
nav has a single "Community" item. The public `/p/[token]` share page still works
for external links and now reuses the same profile renderer.

### Detail of changes made
- **`lib/directory.ts`** — `DirectoryCard` extended with `skillsets`, `isStudent`,
  `linkedinUrl`, `githubUrl`. `buildDirectoryCard` now:
  - Detects a STUDENT account via `isStudentAccount(row)` (`extra.accountType ===
    "student"`, imported from `lib/family-display`).
  - **Coarsens students:** first name only (no surname), location coarsened to
    `state` (else `country`) — never the precise city — and the children list +
    child interests are dropped entirely.
  - Exposes `skillsets` behind the existing `"interests"` share field (trimmed,
    non-empty).
  - Exposes LinkedIn (`row.linkedinUrl`) + GitHub (`https://github.com/<username>`)
    only when the NEW `"links"` share field is opted in. GitHub URL derived from
    the public `githubUsername` (no new column).
- **`lib/share.ts`** — added `{ key: "links", label: "LinkedIn & GitHub links" }`
  to `SHARE_FIELDS`. Deliberately ABSENT from `DEFAULT_SHARE_FIELDS`, so it is
  OFF by default (existing members' links never appear until they opt in). The
  thanks-page share-settings UI iterates `SHARE_FIELDS`, so the checkbox shows up
  automatically.
- **`components/profile-view.tsx`** (NEW) — shared async server component that
  renders a full profile. Powers BOTH `/p/[token]` (variant `"public"`,
  full-bleed) and `/community/[token]` (variant `"dashboard"`, contained inside
  the shell). Runs the same `canViewProfile` gate, applies the SAME student
  coarsening as the card (first name only, region-only location, no children),
  and renders opt-in LinkedIn/GitHub links + a skills section.
- **`app/p/[token]/page.tsx`** — slimmed to delegate to `<ProfileView
  variant="public" />` (kept metadata + `dynamic`). Its `photo-carousel.tsx` was
  moved to `components/photo-carousel.tsx` (git mv) so both routes share it.
- **`app/(authed)/community/[token]/page.tsx`** (NEW) — in-tab profile route:
  auth + OHS-family gate (identical to the showcase index) → `DashboardShell` →
  `<ProfileView variant="dashboard" />`. No navigation out of the shell.
- **`app/(authed)/community/page.tsx`** — rewritten as the consolidated showcase:
  directory load path (`signups` + `children`, `isDirectoryVisible` gate,
  presigned photos, `buildDirectoryCard`) + the map/stats aggregates, all loaded
  in parallel. Renders a compact bordered map widget + a condensed stat-chip strip
  beside it, then the `ShowcaseClient` member grid (Suspense-wrapped for
  `useSearchParams`). Keeps `UnverifiedNotice` + the OHS-family gate.
- **`app/(authed)/community/showcase-client.tsx`** (NEW) — fork of the old
  directory client: same URL-persisted filters (search, age dual-range, near-me
  radius, interest/skill chips, sort, per-row) via `lib/directory-url-state`.
  Cards link to `/community/<token>` (in-tab), show a student badge, merge
  interests+skillsets into the chip strip + search/filter, and surface small
  LinkedIn/GitHub icon-links.
- **`app/(authed)/directory/page.tsx`** — replaced with a `redirect("/community")`.
  `directory-client.tsx` deleted.
- **`components/dashboard-shell.tsx`** — removed the separate "Directory" nav
  item; the single "Community" item (now using `IconUsers`) covers both. Dropped
  the unused `IconGlobe` import.
- **`components/icons.tsx`** — added `IconLinkedin` + `IconGithub` (house style;
  no emoji).
- Copy/link cleanups pointing at `/community` instead of `/directory`:
  `app/(authed)/dashboard/page.tsx` (merged the two Explore cards into one
  "Community" card; dropped unused `IconGlobe`), `app/(authed)/verify/page.tsx`,
  `app/signup/thanks/share-settings.tsx` (also `<a>`→`<Link>` for the lint rule),
  `app/(authed)/account/page.tsx`, `app/(authed)/admin/api-requests/actions.ts`
  (`revalidatePath("/directory")` → `/community`), and a stale comment in
  `app/page.tsx`.
- **`lib/directory.test.ts`** — added coverage for skillsets gating, links opt-in
  (default-OFF), parent vs. student `isStudent`/full-name, and a full student
  coarsening block (first-name-only, region-only location, country fallback, no
  children/child-interests, but skills/builder/links still shown).

### Validation
- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run test` — 20 files, 218 tests passing.
- `npm run build` — compiled successfully; `/community`, `/community/[token]`,
  `/directory` (redirect), and `/p/[token]` all build. Suspense/client boundaries
  compile.
- Browser preview NOT run: no `.env.local` (DB + Clerk) in this worktree, so the
  authed showcase can't render real data locally (would redirect to sign-in).

### Potential concerns to address
- **Student coarsening source of truth:** `accountType === "student"` lives in
  `extra`. If a real student account isn't tagged that way, it would be treated as
  a parent (full name + city). Verify the student signup flow always sets
  `extra.accountType = "student"`.
- **`"links"` opt-in default-OFF** means no existing member shows links until they
  re-open share settings and tick the new box. That is the intended privacy
  default; product may want a one-time prompt to surface it.
- **GitHub link from `githubUsername`:** the field is required at signup but not
  validated as a real handle — a bad value yields a dead `github.com/<x>` link
  (only when the member opts into links).
- **`/p` student coarsening is now also applied on the public page** (first name,
  region-only, no children) for consistency. This is a privacy tightening but
  changes what an existing student's public share link shows; intended.
- The compact map widget is a straight reuse of `WorldMap`; on very narrow
  viewports the side-by-side grid collapses to stacked (lg breakpoint) — looks
  fine but wasn't visually verified in a browser.
