## Progress Update as of 2026-06-09 5:50 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Profile pages now show the subject's canonical industries as turquoise badges inline with the regular badges, and EVERY badge on a profile is a link to the leaderboard filtered to everyone with that badge. The owner ✓/✗ confirm/reject controls keep working independently of the link.

### Detail of changes made:
- `src/lib/badges.ts`:
  - New `BadgeCategory` value `"industry"` + turquoise class (`border-teal-400/40 bg-teal-400/10 text-teal-300`) in `BADGE_CATEGORY_CLASS`.
  - `BadgeInputs` gains `canonicalIndustries`; `computeBadges` emits one badge per slug (`id = "industry:<slug>"`, label via `industryLabel`, `status: "confirmed"` so it shows in the category color), de-duped. Imports the pure (DB-free) `industryLabel`.
- `src/components/Badges.tsx`:
  - New `leaderboardLinks` prop. `leaderboardHrefFor(badge)` → `/leaderboard?industry=<slug>` for industry badges, `/leaderboard?badge=<id>` for fixed-taxonomy badges in `FILTERABLE_BADGE_IDS`, else null.
  - `PillReadOnly` + `EditablePill` accept `href` and render the pill body as an `<a>`. On editable pills the ✓/✗ popover is a sibling of the link (not nested), so confirm/reject never navigate. Industry badges (like "claimed") render read-only even for owners.
- `src/app/(authed)/profile/page.tsx`: passes `canonicalIndustries: row.canonicalIndustries` to `computeBadges` and `leaderboardLinks` to `<Badges>`.
- Scope: industry badges + links are on the PROFILE only. The leaderboard is unchanged (it still filters by industry via its sidebar; its in-page badge click-to-filter is untouched).

### Potential concerns to address:
- Investor industry-FOCUS badges (`industry-<slug>`, category investor) are a separate, older concept and remain non-clickable — only the new canonical-industry badges (category `industry`) and `FILTERABLE_BADGE_IDS` link out.
- Pre-existing `react-hooks/set-state-in-effect` lint errors in `Badges.tsx` (the fit-mode measurement effect) are untouched and non-blocking.
- Verified `computeBadges` emits the right turquoise badges + ids for a sample founder's industries (devtools/ai-ml/data/fintech); will confirm rendering on prod after deploy.
