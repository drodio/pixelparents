## Progress Update as of 2026-06-11 12:15 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented per-attendee scoring status chips ("Queued" / "Scoring…" / "Complete" / "Failed") in the admin event AttendeeManager, replacing the aggregate "Queued N attendee(s) — scoring runs in the background" success message with live per-row status chips that poll every 4 seconds while any attendee is actively scoring.

### Detail of changes made:
- `src/lib/event-attendees-admin.ts`: Added `AttendeeScoringStatus` type, `mapItemStatus()` helper, and `getAttendeeScoringStatuses(eventId)` function. Queries `scoringJobItems` joined to `scoringJobs`, scoped to active jobs (queued/running) or jobs completed in the last 15 minutes. Matches by `evaluationId` (matched attendees) or `linkedinUrl` (unmatched). Added imports for `scoringJobItems`, `scoringJobs`, `inArray`, `or`, `gte`, `asc`, and `type SQL` from drizzle-orm.
- `src/app/api/admin/events/[id]/attendees/scoring-status/route.ts`: New GET endpoint returning `{ statuses: Record<string, AttendeeScoringStatus> }`. Auth-gated via `requireGrant("manage_events")` + `canAccessEvent(id)`. Matches sibling route style.
- `src/app/(authed)/admin/events/[id]/page.tsx`: Added `getAttendeeScoringStatuses` to the existing `Promise.all`, passes `initialScoringStatuses={scoringStatuses}` to `<AttendeeManager>`.
- `src/components/admin/AttendeeManager.tsx`: Added `StatusChip` component (zinc/amber/emerald/red styles with `animate-pulse` on scoring), `initialScoringStatuses` prop, `statuses` state, `refreshStatuses()` helper, 4-second polling `useEffect` (active only while any status is queued/scoring), chip rendered right of each attendee's name in both matched and unmatched branches. In `rescoreAll()` success path: removed aggregate message, calls `void refreshStatuses()` and clears `rescoreMsg` instead. Insufficient-credits error message preserved.
- `tests/app/attendee-scoring-status.test.ts`: 7 DB-backed tests covering scoring/complete/failed/queued statuses, the 15-minute cutoff, the empty-attendees case, and the URL-only (no evaluationId) match path. All pass against the test DB.

### Potential concerns to address:
- The 15-minute window for "recently completed" jobs is a UX heuristic — if a job takes longer than 15 minutes, chips would disappear before the user refreshes. Could be extended if needed.
- `refreshStatuses()` is defined inside the component body but is referenced inside the polling `useEffect` and in `rescoreAll`; the `useEffect` dependency array uses inline fetch to avoid the stale-closure issue.
- Polling uses `setInterval` and guards with a `cancelled` flag; no `useCallback` on `refreshStatuses` means each render creates a new closure, but the polling effect only re-runs when `statuses` or `eventId` changes, so this is safe.
