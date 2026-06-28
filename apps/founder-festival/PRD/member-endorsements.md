## Progress Update as of 2026-06-10 2:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Verified the section UI via a throwaway preview route + headless screenshot (form, 3-way visibility, gold points input, existing-endorsement list with members-only points hidden all render correctly), then removed the preview route. Full tsc + lint clean. Ready to ship code to prod. PROD MIGRATION (apply-endorsements-tables.ts prod) still needs the user's explicit OK — reads are deploy-safe (return [] if the table is missing), so prod won't crash; saving an endorsement needs the table.

## Progress Update as of 2026-06-10 2:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Built the UI + wiring: reusable 3-way `VisibilitySlider`; `/api/endorsements` POST (claim-gated, self-endorse rejected, points/visibility clamped); `MemberEndorsements` section (list + gold compose form with MentionInput, endorsement visibility, gold points input, constrained points visibility). Profile page: hide EventsCTA when a claimed member views someone else's profile; render Member Endorsements above Credibility for claimed viewers; "People you've endorsed" list on own profile with scroll-anchor links. Deferred: migrating the EXISTING event-answers (recommendations) slider to 3-way — a shared privacy refactor — to a follow-up.

### Detail of changes made:
- New: `VisibilitySlider.tsx`, `MemberEndorsements.tsx`, `api/endorsements/route.ts`.
- Modified: `profile/page.tsx` (EventsCTA gate + endorsements section + endorsed-by-me + data loads).

### Potential concerns to address:
- Recommendations/event-answers slider is still 2-way (deferred 3-way migration).
- @mention autocomplete currently searches members only (badge @mention is a follow-up); placeholder text still mentions badges.
- Editing an existing endorsement starts with an empty text box (MentionInput has no initial value) — upsert still replaces correctly.
- Prod migration (apply-endorsements-tables.ts prod) required before prod use.
## Progress Update as of 2026-06-10 1:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added `src/lib/endorsements.ts` server data layer: `getViewerPointsBudget` (score − allocated), `createOrUpdateEndorsement` (clamps points to budget + pointsVisibility ≤ visibility, upsert per from→to), and visibility-filtered `listEndorsementsForProfile` / `listEndorsementsByMember` (self-join endorser+endorsee via drizzle alias). Deploy-safe try/catch.

## Progress Update as of 2026-06-10 1:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added the `endorsements` table (schema + idempotent `scripts/apply-endorsements-tables.ts`, applied to DEV, committed drizzle migration 0048). Columns: evaluation_id (endorsee), from_evaluation_id + from_clerk_user_id (endorser), body, visibility, points, points_visibility. Unique on (from, to).

## Progress Update as of 2026-06-10 1:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Started building Member Endorsements (vouching) per the user's 7 requirements + the design doc. Building on a branch for localhost review — NOT shipping to prod yet. Plan at `docs/superpowers/plans/2026-06-10-member-endorsements.md`.

### Detail of changes made:
- `src/lib/endorsement-constants.ts` (+ test): DB-free 3-way `Visibility` (public | members_only | private), `allowedPointsVisibilities` (points can't be more visible than the endorsement), `canViewAtVisibility`, `clampPointsVisibility`, and the `ENDORSE_PLACEHOLDER(firstName)` text.

### Potential concerns to address:
- Requirement 4/5 changes the EXISTING event-answers visibility slider from 2-way to 3-way — a refactor of shipped behavior (`recommendationVisibility` sparse table + its API). Being done carefully; sparse table will now store `members_only` too.
- Prod migration for the `endorsements` table will be needed before this ships (dev only for now).
