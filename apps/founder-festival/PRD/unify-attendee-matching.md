# PRD — unify-attendee-matching

## Progress Update as of 2026-06-07 10:47 AM Pacific
*(Most recent updates at top)*

### Summary
Unified the event analytics counts/radars with the attendees table: both now
resolve attendees to scored profiles via the SAME shared resolver (email match +
unique exact-name fallback, any claimed status). Also updated the attendees-table
CTA copy.

### Detail
- `events.ts`: extracted `resolveEventAttendeeEvalIds(eventId)` (email +
  unique-name fallback) from getEventAttendeeRows; getEventAttendeeRows now calls
  it. getEventAnalytics now resolves via the same helper and loads those evals'
  scoring data (was an email-only innerJoin), so Founders/Investors counts + the
  radars include name-matched (and unclaimed) profiles — matching the table.
- `AttendeesTable.tsx`: CTA "Claim your profile to see who attended." →
  "[Become a Festival member] to see the attendee list." (link → /?find=1).

### Verification
- `next build` compiles + typechecks.
