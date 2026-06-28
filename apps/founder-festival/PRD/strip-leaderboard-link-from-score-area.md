# Branch: `strip-leaderboard-link-from-score-area` — progress log

Branched from `main` (post PR #54).

## Progress Update as of 2026-05-26 1:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
User QA: "Re-Score Me is STILL going to leaderboard". The two prior
attempts (move Re-Score Me to the link row in #15-ish, restyle as
gold pill in PR #53) didn't solve it because the giant Combined
score number AND the "#N on Leaderboard" text RIGHT NEXT to the
Re-Score Me button were BOTH `<a href="/leaderboard?e=...">` links.
Clicking anywhere in that area was sending the user to leaderboard.

Strip the two leaderboard links entirely so Re-Score Me is the
ONLY clickable element in that block:
- Giant score `<a>` → `<span>` (plain text)
- "#N on Leaderboard" `<a>` → `<span>` (plain gray text)
- `|` separator removed (no longer needed — the styles are now
  visually distinct: gray rank text vs outlined gold pill button)

Users can still reach /leaderboard via the splash form's
"Leaderboard" CTA and by direct URL. If we later want a leaderboard
link on the profile page, add it back as a clearly-labeled button
positioned away from Re-Score Me.

### Files touched:
- `src/app/(authed)/profile/page.tsx` — lines ~480-494, removed the
  two `<a>` wrappers, simplified the row.

### Potential concerns:
- If users want a fast leaderboard link from /profile and complain,
  add a separate "View Leaderboard" link elsewhere (e.g., under the
  Score header chip).
