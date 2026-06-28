# Branch: `leaderboard-button-rescore-link` — progress log

Branched from `main` (post PR #57).

## Progress Update as of 2026-05-26 2:50 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Swap the visual roles in the Combined-score area so Re-Score stops
"taking the user to the leaderboard":

- **Leaderboard is now the BUTTON** — the "#N on Leaderboard" control
  is an outlined gold pill `<a href="/leaderboard?e=<id>">`.
- **Re-Score Me is now a plain link** — `.link` (gold text), not a
  pill. Reads as link (action) vs. button (navigate).
- **No pipe** between them (already gone since PR #56).
- **The giant Combined score number stays a plain `<span>`** (not an
  anchor — confirmed in source). This was the actual culprit behind
  "Re-Score takes me to the leaderboard": the whole number used to be
  a `/leaderboard` link, so clicks near it navigated away. Now the
  ONLY `/leaderboard` link on the page is the dedicated pill button,
  so a Re-Score click can never be swallowed.
- **Claim-gate preserved**: ReScoreButton.onClick → if `!isOwner`,
  open ClaimProfileModal (claim first); if owner, run the rescore.

### Files touched:
- `src/components/ReScoreButton.tsx` — `variant="link"` reverted from
  the outlined pill (PR #53) back to a plain `.link` text button.
- `src/app/(authed)/profile/page.tsx` — "#N on Leaderboard" rendered
  as the outlined gold pill `<a>` → `/leaderboard?e=<id>`.

### Verified:
- `pnpm tsc --noEmit` clean.
- Rendered a real profile on :3004: exactly one `/leaderboard?e=`
  anchor (the pill), Re-Score Me present, score number is a `<span>`.

### Potential concerns:
- None. (Leaderboard link keeps `?e=<id>` so it highlights the user's
  own row — still "/leaderboard", just deep-linked.)
