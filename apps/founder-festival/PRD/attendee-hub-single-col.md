# PRD — attendee-hub-single-col

## Progress Update as of 2026-06-09 1:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Attendee hub directory is now a single column (one attendee per full-width row) instead of a
2-col grid — the two columns were too narrow and badges (e.g. Jordan Lee's) overflowed the card.
One-line change. No schema/migration.

### Detail of changes made:
- `src/components/events/AttendeeDirectory.tsx`: container `grid gap-3 sm:grid-cols-2`
  → `flex flex-col gap-3`.
