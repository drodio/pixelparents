## Progress Update as of 2026-05-28 09:50 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Defaults the credibility radar to opening the highest-scoring vector's drill-down on load instead of showing nothing until the user clicks. Matches the screenshot mockup the user shared earlier.

### Detail of changes made:
- `src/components/CredibilityRadar.tsx`: replaces `useState<string | null>(null)` with `useState<string | null>(initialKey)` where `initialKey` = the vector with the highest `score` (argmax). Reducer-based, so falls back to null cleanly when `vectors` is empty.
- No behavior change after first render — once the user clicks anything, the existing `setSelectedKey` handler takes over.
- Type check clean.

### Potential concerns to address:
- **Ties** — when two vectors share the same score, the earlier one in the array wins (stable). Acceptable; the user's intuition matches "show me the strongest one first."
- **Investor radar** — same component is reused for both founder + investor radars (`CredibilityRadarSection` flips between the two). The default-to-highest behavior fires independently for each, so flipping dimensions also flips the open drill-down. Probably the right behavior.
