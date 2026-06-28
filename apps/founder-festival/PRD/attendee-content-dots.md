# attendee-content-dots

## Progress Update as of 2026-06-22 08:39 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added two status dots to the right of each attendee's name in the admin event
attendee list: the first for **Personalized Learnings**, the second for **Attendee
Insights**. Green when that insight has generated content, red when it's missing.

### Detail of changes made:
- `src/components/admin/AttendeeManager.tsx`: new pure `hasInsightContent(entry)`
  (green only when `status === "done"` AND the HTML has non-empty body text — so
  generating/failed/never-run/empty all read red), plus `ContentDot`/`ContentDots`
  components. The dots render next to the name (before the scoring `StatusChip`) for
  any row with an `evaluationId`, keyed off the already-loaded `learnings` /
  `connections` maps. Each dot has a title/aria-label ("Personalized Learnings:
  present|missing", etc.).
- No new data fetching — `AttendeeManager` already receives `initialLearnings`
  (`getStoredPersonalizedForEvent`) and `initialConnections`
  (`getStoredConnectionsForEvent`) per eval, and the dots reuse the same merged maps
  that the existing expand-row accordions use (so they reflect live generation too).
- `hasInsightContent` is exported and unit-tested in
  `tests/components/attendee-content-dots.test.ts` (4 cases: done+content green;
  missing/generating/failed/empty red).

### Potential concerns to address:
- Unmatched rows (no `evaluationId`) show no dots — they can't have insights (keyed by
  eval). Intentional.
- "Green" requires `status === "done"` with real body text; a "done" record that somehow
  stored empty HTML reads red (treated as missing), which matches the intent.
