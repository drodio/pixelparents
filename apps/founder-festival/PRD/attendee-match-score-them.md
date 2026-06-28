# attendee-match-score-them

## Progress Update as of 2026-06-10 9:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
In the admin attendee manager, the per-row "find a match" search for an unmatched
attendee now offers "Score them now" (the same flow as the leaderboard/header
search) when there are no matching profiles — so an admin can score a brand-new
founder instead of hitting a "No matches." dead end.

### Detail of changes made:
- `src/components/admin/AttendeeManager.tsx` (`MatchPicker`): replaced the
  "No matches." `<li>` with `<ScoreThemPrompt name={trimmed} />` (compact
  className). ScoreThemPrompt links to the homepage scoring flow (`/?name=…`).
  After scoring, the admin returns and the search finds + links the new profile.

### Potential concerns to address:
- Two-step flow (score on homepage → come back and match); an inline
  score-and-link would be a larger follow-up. ScoreThemPrompt already used by the
  top-level add-search, so this is consistent.
