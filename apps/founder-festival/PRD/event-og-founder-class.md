# PRD — event-og-founder-class

## Progress Update as of 2026-06-06 06:32 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
(1) Event social-card image now previews the event (cover, else first public
recap photo) instead of falling back to the FF logo. (2) Event analytics now
count someone as a founder if they're a CURRENT or PAST founder (and investor on
the same basis), so a founder-who-also-invests is counted as a founder — fixes
DROdio's "why only 5 founders" (some were classified investor by dominant score).

### Detail of changes made:
- `events/[slug]/page.tsx` generateMetadata: og/twitter image = `event.coverUrl`
  else the first PUBLIC recap photo's blobUrl (twitter card = summary_large_image).
- `event-analytics.ts`: ScoredAttendee gains founderStatus/investorStatus; new
  `isFounder`/`isInvestor` (current|past, else score>0 fallback); computeCohortStats
  now uses them (a person can be BOTH). `classifyRole` kept (still used for
  single-bucket connection grouping).
- `events.ts` getEventAnalytics: selects founderStatus/investorStatus; radar split
  uses isFounder/isInvestor (a both-person feeds both radars).
- Test updated for the both-counting semantics + a status-unknown fallback case.

### Verification done:
- event-analytics test 5/5; `next build` compiles + typechecks.

### Note on "only 5 founders":
- Biggest factor is still MATCHING — only attendees linked to a scored profile
  count; most of the 20 RSVPs aren't matched. This change fixes the secondary
  factor (founders mis-counted as investors by dominant score). Counts can't
  exceed the matched-and-scored cohort.
