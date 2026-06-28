# PRD — event-attendees-table

## Progress Update as of 2026-06-07 10:36 AM Pacific
*(Most recent updates at top)*

### Summary
Added an "Attendees" table to the event recap (above Event Description), in
leaderboard format, with a "Load more" (5 rows default). Also broadened attendee
→ profile matching to look at ALL scored profiles regardless of claimed status
(email match, then a unique exact-name fallback).

### Detail
- `leaderboard.ts`: new exported `getLeaderboardRowsForEvalIds(ids)` — reuses the
  exact `decorateRows` decoration (company/badges/image/profileHref), excludes
  low-signal.
- `events.ts`: `getEventAttendeeRows(eventId)` → resolves each approved attendee
  to a scored profile by stored evaluationId (email match) OR a UNIQUE exact
  full-name match (addresses "count all profiles regardless of claimed status").
  Returns `{ rows: LeaderboardRow[] (combined-desc), unmatchedNames }`.
- `AttendeesTable.tsx` (new): leaderboard-format rows (avatar/name/company/badges
  + founder/investor/combined). Claimed viewers → full data, rows link to the
  profile. Anonymous/unclaimed → name/company/badges/avatar blurred (CSS),
  scores visible, rows + a header CTA link to /?find=1 to claim. 5 rows + "Load
  more". Unmatched attendees shown as name-only rows ("—" scores).
- `events/[slug]/page.tsx`: fetch + render `<AttendeesTable>` above Event Description.

### Verification
- `next build` compiles + typechecks.

### Potential concerns
- The "Founders/Investors" STAT TILES still use email-only matching (getEventAnalytics);
  the table uses email+name. So the table may surface more founders than the tile
  count. Could unify the analytics counts to the same resolution as a follow-up.
- Name-fallback does one query per unresolved attendee (bounded by attendee count).
- Blur is CSS-only (names still in DOM) — consistent with the photo-lock tradeoff.
