# connection-intro-email

## Progress Update as of 2026-06-08 11:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Final-review fixes: repaired failing CI test (approved→contact null, not email), added auto-approve intro email send in connect route, and updated stale type comment.

### Detail of changes made:
- `tests/app/attendee-connections.test.ts`: renamed test to "...hides contact on approval (intro email instead)..."; updated comment from "now a sees b's contact" to "a no longer sees b's contact — approved connections are introduced over email instead"; changed `expect(dir[0].contact?.email).toBe("b@example.com")` to `expect(dir[0].contact).toBeNull()`. The `open_to_all` assertion below it is unchanged, so the test now covers both: approved→no contact AND open_to_all→contact.
- `src/app/api/events/[slug]/connect/route.ts`: added `introduceConnection` to the import from `@/lib/attendee-connections`; added auto-approve intro email block after the pending-email block — gates on `autoResolved === "auto_approve"` to prevent re-sends on duplicate clicks, best-effort.
- `src/lib/attendee-connections.ts`: updated `DirectoryEntry.contact` comment from "OR there's an approved connection" to "approved connections are introduced over email instead".

### Potential concerns to address:
- None new.

## Progress Update as of 2026-06-08 10:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 4 complete: updated success copy in `ConnectionRespond.tsx` from "your email and LinkedIn will be shared with them" to "we've emailed an intro to you both"; build passes clean.

### Detail of changes made:
- `src/components/events/ConnectionRespond.tsx`: approval success message updated to reflect new intro-email flow.

### Potential concerns to address:
- None new.

## Progress Update as of 2026-06-08 10:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 3 complete: hooked `introduceConnection` best-effort into both approval routes (`/api/connections/respond` and `/api/connections/decide`); build passes clean.

### Detail of changes made:
- `src/app/api/connections/respond/route.ts`: imports `introduceConnection`; calls it best-effort when `row.status === "approved"`.
- `src/app/api/connections/decide/route.ts`: imports `introduceConnection`; calls it best-effort when `row.status === "approved"`.
- Both routes: mail failure logged but not propagated (approval still returned 200).

### Potential concerns to address:
- None new.

## Progress Update as of 2026-06-08 10:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 2 complete: added `introduceConnection` helper to `attendee-connections.ts`; removed approval contact reveal from `getEventDirectory`; guarded `decideConnectionRequest` to pending-only for idempotency.

### Detail of changes made:
- `src/lib/attendee-connections.ts`: added `events` to schema import and `sendConnectionIntroEmail` import.
- `src/lib/attendee-connections.ts`: exported `introduceConnection(row, origin)` — resolves emails from attendee or foundEmail, skips if either missing, sends double-opt-in intro to both.
- `src/lib/attendee-connections.ts`: `getEventDirectory` reveal changed from `mode === "open_to_all" || connectionStatus === "approved"` to `mode === "open_to_all"` only.
- `src/lib/attendee-connections.ts`: `decideConnectionRequest` update WHERE clause now guards `status = "pending"` for idempotency.
- `tests/app/connection-intro.test.ts`: 2 DB-backed tests (sends intro to 2 emails; skips when email missing) — both passing.
- Minor deviation: plan's test used `(...a: unknown[]) => sendMock(...a)` which fails TS strict spread; changed to single-arg form to satisfy TypeScript (runtime behavior identical).

### Potential concerns to address:
- None new.

## Progress Update as of 2026-06-08 10:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 1 complete: added `buildConnectionIntroEmail` (pure, unit-tested) and `sendConnectionIntroEmail` to `email.ts`; also updated the connection-request email copy to say "we'll email an intro to you both" instead of revealing email/LinkedIn.

### Detail of changes made:
- `src/lib/email.ts`: exported `buildConnectionIntroEmail` (pure builder, escapes user-supplied names) and `sendConnectionIntroEmail` (sends to array of recipients via Resend).
- `src/lib/email.ts`: updated `sendConnectionRequestEmail` copy: "If you approve, we'll email an intro to you both."
- `tests/lib/connection-intro-email.test.ts`: 3 unit tests (subject format, HTML links + sign-off, HTML escaping) — all passing.

### Potential concerns to address:
- None new; Resend `to: [a,b]` array confirmed supported.

## Progress Update as of 2026-06-09 10:55 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wrote the task-by-task implementation plan (`docs/superpowers/plans/2026-06-09-connection-intro-email.md`, 5 tasks, TDD, full code).

### Detail of changes made:
- Plan: (1) buildConnectionIntroEmail + sendConnectionIntroEmail + request-email copy, (2) introduceConnection helper + drop approval reveal + idempotent decide guard, (3) hook both routes best-effort, (4) success copy, (5) verify + PR.

### Potential concerns to address:
- Resend `to: [a,b]` array support (it does); reply-all is the connect channel.


# connection-intro-email

## Progress Update as of 2026-06-09 10:45 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wrote the approved design spec
(`docs/superpowers/specs/2026-06-09-connection-intro-email-design.md`): on
connection approval, stop revealing raw email/LinkedIn and instead send one
double-opt-in intro email to BOTH people (reply-all to connect) with their
profile links + a clickable event link. From hello@festival.so, signed
"#Velocity, DROdio".

### Detail of changes made:
- Design: remove the `approved` reveal in getEventDirectory (keep open_to_all);
  add `introduceConnection(row, origin)` hooked from both approval routes
  (/api/connections/respond + /decide), best-effort. Pure
  `buildConnectionIntroEmail` + `sendConnectionIntroEmail` (to:[a,b]) in email.ts.
  Guard `decideConnectionRequest` to pending-only for idempotency. Copy updates.

### Potential concerns to address:
- If either party lacks an email, intro is skipped (approval still recorded).
- No schema change.
