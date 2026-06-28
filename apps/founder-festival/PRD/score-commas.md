# Branch: `score-commas` — progress log

## Progress Update as of 2026-06-03 3:30 PM Pacific — comma-format profile scores

### Summary of changes since last update
The big "Combined" score on the public profile (e.g. festival.so/profile/founder/jordan-lee)
rendered raw — "57112" instead of "57,112" — while the Founder / Investor
labels next to it already used `.toLocaleString("en-US")`. Two parallel
raw renderings in the Open Graph share-image had the same bug.

### Detail of changes made:
- `src/app/(authed)/profile/page.tsx` — `{row.score}` → `{row.score.toLocaleString("en-US")}`
  in the giant Combined-score heading.
- `src/app/api/og/route.tsx` — same fix in two places: the dominant-dimension
  big numeral and the footer's "Combined: <score>" line.

### Verification:
- tsc + eslint clean on touched files (pre-existing `<a>`/`<img>` warnings
  were not introduced here).
- Existing leaderboard / admin / score-detail render sites already used
  `.toLocaleString("en-US")` — no other raw renderings of meaningful score
  numbers found.
- The super-admin Score Detail modal's per-row "+points" rendering is left
  alone (small per-line bonuses, admin-only debug audience).

### Potential concerns to address:
- None new.
