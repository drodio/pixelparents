# event-attendee-management

## Progress Update as of 2026-06-08 6:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two final fixes from code review: (1) `removeAttendee` now removes the whole person across both Luma and manual rows when an `evaluationId` is shared; (2) `AttendeeManager` surfaces add/remove API errors via a new `actionMsg` state rendered in red below the rescore message.

### Detail of changes made:
- `src/lib/event-attendees-admin.ts` `removeAttendee`: now first selects the target row's `evaluationId`; if non-null, soft-deletes ALL `eventAttendees` rows sharing that `evaluationId` + `eventId` (covers both the Luma row and the manual row); if null (unmatched name-only row), soft-deletes only the single row by id. Returns `false` early if the target row doesn't exist. Replaced the previous single-row update approach.
- `src/components/admin/AttendeeManager.tsx`: added `actionMsg` state (`useState<string | null>(null)`); `add()` now sets `actionMsg` with a human-readable error on non-ok response (parses JSON for `error` field, falls back to status code) and clears it on success; wrapped in try/catch for network errors. `remove()` same treatment. Rendered `{actionMsg && <p className="text-sm text-red-400">{actionMsg}</p>}` immediately after the `rescoreMsg` line.
- `tests/app/event-attendees-admin.test.ts`: added a third test (`removeAttendee removes the whole person when both a Luma row and a manual row exist`) that seeds an event + eval, inserts a raw Luma row + calls `addManualAttendee`, confirms `resolveEventAttendeeEvalIds` includes the eval, calls `removeAttendee` via the deduped admin-list row id, then asserts the eval is absent from the resolver (both rows removed).

### Potential concerns to address:
- None — tests pass 3/3, `tsc --noEmit` clean, ESLint clean.

## Progress Update as of 2026-06-08 7:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wired `AttendeeManager` into the admin event detail page (Task 6): added imports, appended `listEventAttendeesAdmin` to the existing `Promise.all`, computed `canRescore` via `can("run_scoring_jobs")`, and rendered a new Attendees `<section>` after the Photos section.

### Detail of changes made:
- `src/app/(authed)/admin/events/[id]/page.tsx`: added three imports (`listEventAttendeesAdmin`, `AttendeeManager`, `can`); appended `listEventAttendeesAdmin(id)` as the 8th element of the `Promise.all` and destructured it as `attendees`; added `const canRescore = await can("run_scoring_jobs")` after the `Promise.all`; inserted `<section>` with `<AttendeeManager eventId={event.id} initialAttendees={attendees} canRescore={canRescore} />` immediately after the Photos section.
- Build: `✓ Compiled successfully` with no type errors.

### Potential concerns to address:
- `canRescore` is computed with a separate `await can(...)` after the `Promise.all` — could be parallelized in a future cleanup, but correctness is unaffected.

## Progress Update as of 2026-06-08 7:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added an `aria-label="Search attendees by name"` to the AttendeeManager search
input (a11y fix from code-quality review — the placeholder alone wasn't announced
by screen readers).

### Detail of changes made:
- `src/components/admin/AttendeeManager.tsx`: search `<input>` now has an
  aria-label (mirrors HeaderSearch's labeled input).

### Potential concerns to address:
- Non-ok add/remove responses are silently swallowed (consistent with existing
  codebase style); a future pass could surface errors to the admin.

## Progress Update as of 2026-06-08 7:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Created `AttendeeManager` client component (Task 5) — debounced search-add, per-row remove, and re-score-all button.

### Detail of changes made:
- `src/components/admin/AttendeeManager.tsx` (new): "use client" component accepting `eventId`, `initialAttendees: AdminAttendeeRow[]`, `canRescore: boolean`. Debounced search (220 ms, generation-token pattern from HeaderSearch) against `/api/leaderboard/search?q=` with dropdown showing up to 8 results or `ScoreThemPrompt` on empty. Add calls `POST /api/admin/events/:id/attendees`, remove calls `DELETE /api/admin/events/:id/attendees/:attendeeId`, both followed by `router.refresh()`. Re-score button calls `POST /api/admin/events/:id/rescore-attendees` with confirm dialog, displays queued count or error message. Outside-click + Escape close the dropdown.
- One minor deviation from spec: JSX apostrophe in "weren't" escaped to `&apos;` to satisfy React/JSX linting rules (the spec used a raw apostrophe inside JSX text). All imports and type shapes match exactly.

### Potential concerns to address:
- `initialAttendees` is a prop snapshot (not reactive state), so matched/unmatched display and the re-score button count reflect the server render — only updates after `router.refresh()` causes a full RSC re-render. This is intentional and consistent with the design.

## Progress Update as of 2026-06-08 6:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added test case covering the zero-matched-attendee path for the rescore-attendees route.

### Detail of changes made:
- `tests/app/rescore-attendees.test.ts`: Added new test `it("returns count 0 when the event has no matched attendees", ...)` that creates an event with no attendees, calls POST, and asserts HTTP 200 with `{ jobId: null, count: 0 }`.

### Potential concerns to address:
- None — test reuses existing patterns and helpers (`rnd()`, dynamic route import, mocked auth).

## Progress Update as of 2026-06-08 6:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Created `POST /api/admin/events/:id/rescore-attendees` route (Task 4) using TDD. Test file written first (confirmed failing), then the route implemented to match the `rescore-all` pattern exactly. Test passes 1/1 against the dev Neon DB.

### Detail of changes made:
- `src/app/api/admin/events/[id]/rescore-attendees/route.ts` (new): Auth-gated (`run_scoring_jobs` + `canAccessEvent` + `viewerIsUsersScoped`), model-validated, credit-held bulk re-score enqueue. Calls `resolveEventAttendeeEvalIds(id)` then filters to `source="url"` evals only (skips manual "code" scores). Inserts one `scoringJobItems` row per matched eval with `status="resolved"` + pre-filled `linkedinUrl`/`evaluationId`. Chunked inserts (200/batch). Mirrors rescore-all field names exactly: `createdByEmail`, `createdByClerkUserId`, `creditHoldCents`, `estimatedCents`, `totalItems`, `status`, `model`, `title`.
- `tests/app/rescore-attendees.test.ts` (new): DB-backed Vitest under `describe.skipIf(IS_PROD_DB)`. Stubs `requireGrant`, `canAccessEvent`, `viewerIsUsersScoped`, `currentUser`, and `holdCreditsForJob`. Inserts an event + evaluation + attendee (approved, evaluationId linked), calls POST, asserts 200 + `count: 1` + `jobId` truthy, then reads the inserted `scoringJobItems` and confirms `evaluationId` + `status="resolved"`.

### Potential concerns to address:
- No deviations from the rescore-all pattern — field names and credit-hold shape match exactly.
- The route returns `{ jobId: null, count: 0 }` (200) when no url-sourced matched attendees exist; callers should handle this gracefully (disable the button or show a toast).

## Progress Update as of 2026-06-08 6:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Created two admin API route handlers: `POST /api/admin/events/:id/attendees` (add a manual attendee by evaluationId) and `DELETE /api/admin/events/:id/attendees/:attendeeId` (soft-delete an attendee). Both follow the established `requireGrant("manage_events")` + `canAccessEvent` auth pattern. TypeScript compiles clean.

### Detail of changes made:
- `src/app/api/admin/events/[id]/attendees/route.ts` (new): POST handler that validates auth, parses `evaluationId` from the request body, calls `addManualAttendee(id, evaluationId)`, returns 404 if the evaluation is not found or 200 `{ ok: true }` on success.
- `src/app/api/admin/events/[id]/attendees/[attendeeId]/route.ts` (new): DELETE handler that validates auth, calls `removeAttendee(id, attendeeId)`, returns 404 if the row doesn't exist or 200 `{ ok: true }` on success.
- Both routes: `export const runtime = "nodejs"`, async params destructuring, `requireGrant("manage_events")` in try/catch → 403, `canAccessEvent(id)` scope check → 403.

### Potential concerns to address:
- `canAccessEvent` is present in both routes per the task spec; the priorities route omits it — this is intentional and consistent with the spec (event-scoped routes should check ownership).

## Progress Update as of 2026-06-08 5:48 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Three code-quality fixes from the Task 2 review: (1) aligned `getEventAnalytics` total count with the `removedByAdmin` filter so the analytics banner stays consistent after admin removes; (2) made attendee dedupe deterministic by ordering rows `source desc` so manual rows win over Luma rows; (3) narrowed `AdminAttendeeRow.source` from `string` to the `"luma" | "manual"` union with casts at both push sites.

### Detail of changes made:
- `src/lib/events.ts` `getEventAnalytics`: added `eq(eventAttendees.removedByAdmin, false)` to the `count()` query's `where`, so `totalAttendees` no longer includes admin-removed rows.
- `src/lib/event-attendees-admin.ts` `listEventAttendeesAdmin`: added `.orderBy(desc(eventAttendees.source))` to the rows query; "manual" sorts before "luma" alphabetically with `desc`, ensuring the manual row's id is the stable Remove handle when a person has both row types. Imported `desc` from `drizzle-orm`.
- `src/lib/event-attendees-admin.ts` `AdminAttendeeRow`: changed `source: string` to `source: "luma" | "manual"`. Both `out.push(...)` branches cast `r.source as "luma" | "manual"` since Drizzle returns `string`.
- Tests: 2/2 still pass; `pnpm exec tsc --noEmit` exits clean.

### Potential concerns to address:
- No new concerns — previous `listEventAttendeesAdmin` dedupe non-determinism note is resolved by the ordering fix.

## Progress Update as of 2026-06-08 5:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added `removedByAdmin` filter to `resolveEventAttendeeEvalIds`, created `src/lib/event-attendees-admin.ts` with `listEventAttendeesAdmin`, `addManualAttendee`, and `removeAttendee` helpers, and wrote DB-backed tests (TDD) that pass 2/2 against the dev Neon DB.

### Detail of changes made:
- `src/lib/events.ts`: Extended `resolveEventAttendeeEvalIds` `where` clause to include `eq(eventAttendees.removedByAdmin, false)` — removed attendees are now excluded from all downstream analytics and attendee-list rendering.
- `src/lib/event-attendees-admin.ts` (new): Exports `AdminAttendeeRow` type + three functions:
  - `listEventAttendeesAdmin(eventId)` — returns non-removed attendees enriched via `getLeaderboardRowsForEvalIds`, deduped by evaluationId, sorted by score desc.
  - `addManualAttendee(eventId, evaluationId)` — upserts on `(eventId, lumaGuestApiId)` using synthetic key `manual:<evalId>`; flips `removedByAdmin=false` on re-add.
  - `removeAttendee(eventId, attendeeId)` — soft-delete (sets `removedByAdmin=true`) scoped to event; returns false if row not found.
- `tests/app/event-attendees-admin.test.ts` (new): Two DB-backed tests under `describe.skipIf(IS_PROD_DB)`: (1) add manual attendee → list → remove → re-add upserts (doesn't duplicate); (2) resolver excludes admin-removed Luma rows.

### Potential concerns to address:
- `listEventAttendeesAdmin` deduplication uses the first-seen `eventAttendees.id` when a person has both a Luma row and a manual row — the id returned is non-deterministic. This is fine for admin use but worth documenting if the UI needs to show which row type to display.
- `getLeaderboardRowsForEvalIds` excludes low-signal rows — a manual attendee added from a low-signal profile will show `matched: false` even though they have an evaluationId. This matches the intended behavior but may surprise admins.

## Progress Update as of 2026-06-08 10:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added `source` (text, default `"luma"`) and `removedByAdmin` (boolean, default `false`) columns to the `event_attendees` Drizzle table in `src/db/schema.ts`. Generated migration `drizzle/0039_quick_dakota_north.sql` (purely additive ALTER TABLEs with defaults), applied it to the dev Neon DB via `db:push`, and confirmed TypeScript compiles clean.

### Detail of changes made:
- `src/db/schema.ts`: inserted `source` and `removedByAdmin` between `name` and `approvalStatus` in the `eventAttendees` pgTable column block, with doc-comments explaining each column's semantics.
- `drizzle/0039_quick_dakota_north.sql`: two `ALTER TABLE "event_attendees" ADD COLUMN` statements; no data-destructive ops.
- Dev Neon DB updated (`db:push` → "Changes applied"). Migration file committed for the prod-deploy path.
- `pnpm exec tsc --noEmit` exits clean (no errors).

### Potential concerns to address:
- `source` and `removedByAdmin` are `notNull().default(...)` — existing rows will backfill to `"luma"` / `false` automatically on `db:push`; nothing needed manually.
- Migration reaches prod via the normal Vercel deploy path (never db:push from a checkout).

## Progress Update as of 2026-06-09 9:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wrote the task-by-task implementation plan at
`docs/superpowers/plans/2026-06-09-event-attendee-management.md` (7 tasks, TDD,
full code). Verified the three external touch-points the plan depends on: `can()`
boolean grant helper (`src/lib/grants.ts:65`), `LeaderboardRow` fields
(`id/fullName/companyName/combinedScore/profileHref`), and the `rescore-all`
credit-hold shape. No feature code yet — awaiting execution-mode choice.

### Detail of changes made:
- Plan tasks: (1) schema + migration, (2) resolver filter + admin lib helpers +
  tests, (3) add/remove routes, (4) rescore-attendees route + test, (5)
  AttendeeManager client component, (6) wire into admin event page, (7) verify +
  PR.

### Potential concerns to address:
- Migration must reach the prod Neon DB via the deploy path, not db:push from a
  checkout — flagged in the plan's Task 7.

## Progress Update as of 2026-06-09 9:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wrote the design spec for admin attendee management (see
`docs/superpowers/specs/2026-06-09-event-attendee-management-design.md`). No
implementation code yet — pending user review of the spec.

### Detail of changes made:
- Spec covers: see/add/remove attendees + a "Re-Score All" bulk action on the
  `/admin/events/[id]` page.
- **Data model (Approach A):** add `source` (`"luma"`|`"manual"`, default luma)
  and `removedByAdmin` (bool, default false) to `eventAttendees`. Manual adds
  upsert with synthetic key `lumaGuestApiId="manual:<evalId>"`; removes are
  soft-deletes. Both survive the idempotent Luma re-sync (its
  `onConflictDoUpdate` doesn't touch `removedByAdmin`).
- `resolveEventAttendeeEvalIds` gains a `removedByAdmin=false` filter — the single
  choke point feeding the public attendee table, so public rendering is covered.
- **Add search** reuses `/api/leaderboard/search` + `ScoreThemPrompt` (admin
  sibling of `HeaderSearch`); result action is "add" not "navigate."
- **Re-Score All** mirrors `/api/admin/rescore-all`: new
  `POST /api/admin/events/[id]/rescore-attendees` creates one scoring job (items
  `status="resolved"`, evalId+url prefilled); `scoring-tick` cron drains it.
  Auth `run_scoring_jobs` + `canAccessEvent`, non-user-scoped.
- Endpoints: `POST /attendees` (add), `DELETE /attendees/[attendeeId]` (remove),
  `POST /rescore-attendees` (bulk re-score).

### Potential concerns to address:
- Needs a Drizzle migration for the two new `event_attendees` columns; apply to
  dev Neon, prod via normal deploy (never db:push from a checkout).
- Re-Score All spends credits — confirm step must show the estimate and surface
  the insufficient-credit error like rescore-all does.
- Admin list should key matched rows by `evaluationId` to avoid showing a person
  twice if they exist as both a Luma and a manual row (resolver already dedupes
  via Set for scoring/public).
