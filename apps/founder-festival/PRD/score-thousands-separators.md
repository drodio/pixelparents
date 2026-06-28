## Progress Update as of 2026-05-28 02:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Founder, investor, and combined scores now render with thousands separators (e.g. "2,128" instead of "2128") everywhere they appear as raw integers.

### Detail of changes made:
- Used `.toLocaleString("en-US")` (pinned locale → deterministic commas, no hydration mismatch in client components). The repo already uses this pattern (enrichers, ScoreDetailButton).
- `src/app/(authed)/profile/page.tsx`: founder + investor big-number displays.
- `src/components/LeaderboardTable.tsx`: desktop founder/investor/combined cells + mobile card value.
- `src/components/admin/ProfilesScoredTable.tsx`: founder/investor/combined columns.
- `src/components/admin/ApplicantRow.tsx`: founder/investor (nullable → `?.toLocaleString("en-US") ?? "—"`).
- `ScoreDetailButton.tsx` already formatted via `.toLocaleString()` — left as-is.

### Potential concerns to address:
- None functional. Pre-existing unrelated ESLint findings in `profile/page.tsx` (~lines 455-456) remain untouched.
