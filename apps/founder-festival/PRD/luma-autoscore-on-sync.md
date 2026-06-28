# luma-autoscore-on-sync

## Progress Update as of 2026-06-11 5:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Rebased onto latest main; the Phase-1 migration collided with main's 0053, so
dropped it and regenerated as 0054_hesitant_kulan_gath.sql (clean single ALTER
adding event_attendees.linkedin_url). Column already applied to dev + prod.

### Detail of changes made:
- drizzle/0054_hesitant_kulan_gath.sql: ALTER TABLE event_attendees ADD COLUMN linkedin_url text.

### Potential concerns to address:
- None — additive nullable column, already live on dev + prod.

# luma-autoscore-on-sync

## Progress Update as of 2026-06-10 11:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Applied four final-review fixes: (1) sync route now enqueues exactly the URLs seen during the live Luma guest loop (matching the preview modal's basis), not a stale global DB query; (2) bare-word LinkedIn answers like "yes"/"none" no longer become junk URLs; (3) per-attendee score endpoint returns 409 if the attendee is already matched; (4) `linkAttendeesByLinkedin` replaced N+1 SELECT+loop with a single bulk UPDATE. All 22 tests pass; `tsc --noEmit` and `pnpm build` clean.

### Detail of changes made:
- **`src/lib/event-attendees-sync.ts`**: Added `toScoreLinkedinUrls: string[]` to `AttendeeSyncResult` type. During the per-guest loop, guests with `evaluationId === null && linkedinUrl` are pushed to the local `toScoreLinkedinUrls` array. The array is returned alongside the existing fields.
- **`src/app/api/admin/events/sync-luma/route.ts`**: Removed the post-sync global DB query (`event_attendees WHERE evaluationId IS NULL AND linkedinUrl IS NOT NULL`) that could charge for stale/cancelled rows. Now captures `toScoreLinkedinUrls` from `syncEventAttendees()` and passes it directly to `enqueueAttendeeScoring`. Removed unused `and`, `isNull`, `isNotNull`, `db`, `eventAttendees` imports.
- **`src/lib/luma.ts`**: Removed the bare-handle branch (`else if (/^[a-z0-9._-]+$/i.test(s)) candidate = ...`) from `normalizeLinkedinAnswer`. A guest answering "yes"/"none"/"later" to a LinkedIn-labeled question now returns null.
- **`tests/lib/luma-linkedin.test.ts`**: Added test asserting `linkedinUrlFromGuest` returns null when the linkedin-labeled answer is the bare word "yes".
- **`src/app/api/admin/events/[id]/attendees/[attendeeId]/score/route.ts`**: Added `evaluationId` to the DB select. If the attendee already has a non-null `evaluationId`, returns `409 { error: "already matched" }` before attempting to enqueue.
- **`src/lib/attendee-scoring.ts`**: Replaced the select-then-loop in `linkAttendeesByLinkedin` with a single `db.update(...).where(and(eq(...linkedinUrl), isNull(...evaluationId)))` — same semantics, one DB round-trip.

### Potential concerns to address:
- `toScoreLinkedinUrls` may contain duplicates (e.g. same attendee across two events), but `enqueueAttendeeScoring` deduplicates via `Set` internally — no over-charging.
- The 409 guard in the score route prevents re-scoring already-matched attendees; however, if an attendee was matched and then unmatched (evaluationId cleared), the button becomes available again — acceptable edge case.

## Progress Update as of 2026-06-10 11:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented Phase 4 (final — Tasks A + B + C): surfaced `linkedinUrl` + `email` on `AdminAttendeeRow`, added per-attendee score endpoint, and wired the "Score this LinkedIn" button into `AttendeeManager`. `tsc --noEmit` clean, 3 existing tests pass, `pnpm build` clean.

### Detail of changes made:
- **`src/lib/event-attendees-admin.ts`** (modified): Added `linkedinUrl: string | null` and `email: string | null` to `AdminAttendeeRow`. Extended the DB query to select `eventAttendees.linkedinUrl` and `eventAttendees.email`. Both the matched and unmatched branches now populate `linkedinUrl` and `email` on the returned row.
- **`src/app/api/admin/events/[id]/attendees/[attendeeId]/score/route.ts`** (new): `POST` endpoint — auth `requireGrant("manage_events")` + `canAccessEvent(id)` (both 403); fetches attendee's `linkedinUrl` (404 if row missing, 400 if no LinkedIn URL); calls `enqueueAttendeeScoring([url], {clerkUserId, createdByEmail, title})`. Returns 402 `{error:"insufficient_credits", balanceCents, neededCents, topupUrl}` or `{ok:true, jobId, count}`.
- **`src/components/admin/AttendeeManager.tsx`** (modified): Added `scoreLinkedin(attendeeId)` function — POSTs to the new score endpoint, shows "Scoring… (refreshing shortly)" + `router.refresh()` after 1.5s on success; shows "Insufficient credits — top up at /admin/credits" on 402; shows error message otherwise. Reuses existing `busyId` + `actionMsg` state. In the unmatched row: when `a.email` or `a.linkedinUrl` are present, renders them inline (`text-xs text-zinc-500`), with LinkedIn as a new-tab link; when `a.linkedinUrl` is present, renders the "Score this LinkedIn" button (blue border, disabled while busy). The existing `MatchPicker` remains as-is below the new row.

### Potential concerns to address:
- The "Score this LinkedIn" button uses `busyId` for its disabled state, which is shared with the Remove button and the `MatchPicker` Apply button — if the user clicks Score and then immediately tries Apply, Apply will be blocked until the score fetch resolves. Acceptable given the admin-only tool context.
- Scoring an already-scored LinkedIn URL (if the attendee was matched but then the match was removed) will create a duplicate scoring job — `enqueueAttendeeScoring` dedupes only within a single call, not across existing jobs. The cron's link-back is idempotent (only sets evaluationId when null), so no data corruption, just potential wasted credits.

## Progress Update as of 2026-06-10 11:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented Phase 3 (Tasks A + B + C): preview endpoint, enhanced sync route with auto-score enqueue, and `SyncLumaButton` two-step flow with cost-confirmation modal. `tsc --noEmit` and `pnpm build` both clean.

### Detail of changes made:
- **`src/app/api/admin/events/sync-luma/preview/route.ts`** (new): `POST` read-only dry-run. Fetches all Luma events + guests, captures each guest's LinkedIn URL via `linkedinUrlFromGuest`, checks each against `matchEvaluationId(email, linkedin)` to count unmatched profiles, returns `{events, guests, toScore, estimatedCents, willCharge}`. Auth `isAdmin()` (403 else).
- **`src/app/api/admin/events/sync-luma/route.ts`** (modified): after existing `syncLumaEvents` + `syncEventAttendees` calls, queries `event_attendees WHERE evaluationId IS NULL AND linkedinUrl IS NOT NULL`, dedupes by URL, calls `enqueueAttendeeScoring`. On `kind:"insufficient"` returns 402 `{ok:true, synced, attendees, matched, scored:0, error:"insufficient_credits", balanceCents, neededCents, topupUrl}`. On `kind:"ok"` returns `{ok:true, synced, attendees, matched, scored, jobId}`.
- **`src/components/admin/SyncLumaButton.tsx`** (modified): two-step flow — clicking "Sync from Luma" calls the preview endpoint first (shows "Loading…"); stores `PreviewData` state which opens an inline centered modal (dark theme, matches app style). Modal shows event/guest count + "N new profiles will be scored" + cost (amber for charged, green for super-admin exempt). Buttons: "Cancel" / "Sync" or "Sync & Score". Confirm calls real sync; 402 `insufficient_credits` shows top-up message; success shows "Synced N events; scoring M new profiles in the background." Uses `router.refresh()` on completion.

### Potential concerns to address:
- Preview endpoint re-fetches Luma from scratch (separate round-trip from the real sync); for large calendars this adds ~1–2s. Acceptable given the admin-only context.
- The 402 message estimates profile count from `neededCents / 13` (sonnet fallback); this is approximate. The actual count was returned in `toScore` from preview but not propagated through the 402 body — could be improved by storing it in session or returning it directly.
- Modal does not trap focus (no `useEffect`/`focusTrap`) — acceptable for an admin-only tool.

## Progress Update as of 2026-06-10 11:18 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented Phase 2 (Tasks A + B): `enqueueAttendeeScoring` helper in `src/lib/attendee-scoring.ts` and the `linkAttendeesByLinkedin` helper (also in that file) wired into the scoring-tick cron after the applicant link-back block. 6 new DB tests pass; `tsc --noEmit` and `pnpm build` both clean.

### Detail of changes made:
- **`src/lib/attendee-scoring.ts`** (new): exports `enqueueAttendeeScoring(linkedinUrls, opts)` — dedupes URLs, estimates cost via `estimateJobCents`, holds credits via `holdCreditsForJob`, creates a `scoringJobs` row + chunked `scoringJobItems` rows with `status:"resolved"` and `evaluationId:null`. Returns `{kind:"ok"|"empty"|"insufficient"}`. Also exports `linkAttendeesByLinkedin(linkedinUrl, evaluationId)` — queries `event_attendees` where `linkedinUrl=X AND evaluationId IS NULL` and sets `evaluationId`/`updatedAt` on each match.
- **`src/app/api/cron/scoring-tick/route.ts`**: added `import { linkAttendeesByLinkedin } from "@/lib/attendee-scoring"`. After the existing `eventApplicants` link-back for-loop (lines ~263–269), added `await linkAttendeesByLinkedin(linkedinUrl, result.evaluationId)`. The cron variable names mirrored exactly: `linkedinUrl` (mutable let, set during resolution) and `result.evaluationId` (from `runEval`/`reEvaluate` result object).
- **`tests/app/attendee-scoring.test.ts`** (new): 4 DB tests — creates job with 2 items (status resolved, linkedinUrl set, evaluationId null), dedup collapses identical URLs to 1, empty array returns kind "empty", mocked-insufficient hold returns kind "insufficient".
- **`tests/app/attendee-link-back.test.ts`** (new): 2 DB tests — sets evaluationId on attendee with matching linkedin_url and null evaluationId; skips attendee that already has evaluationId set.

### Potential concerns to address:
- `linkAttendeesByLinkedin` issues individual UPDATE statements per attendee (not a single bulk UPDATE) — fine for current volumes; could bulk if needed.
- The helper extracted to `attendee-scoring.ts` (preferred path per spec) is unit-testable and reusable by future per-attendee "Score this LinkedIn" endpoint (Phase 3).
- The `db:push` TTY-blocker from Phase 1 still applies; `linkedin_url` column must be added to dev DB before DB tests run against it.

## Progress Update as of 2026-06-10 11:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented Phase 1 (Tasks 1–4): schema migration for `event_attendees.linkedin_url`, Luma capture helper `linkedinUrlFromGuest`, `AttendeeValues.linkedinUrl`, and `matchEvaluationId(email, linkedin)` in the sync. Pure tests (10) pass. DB-backed tests fail only because the migration hasn't been applied to the dev Neon DB — the column DDL is correct and ready in `drizzle/0053_charming_gwen_stacy.sql`.

### Detail of changes made:
- `src/db/schema.ts`: added `linkedinUrl: text("linkedin_url")` after `name` in `eventAttendees` table.
- `drizzle/0053_charming_gwen_stacy.sql`: generated migration — `ALTER TABLE "event_attendees" ADD COLUMN "linkedin_url" text;`.
- `src/lib/luma.ts`: added `import { canonicalizeLinkedinUrl }` + `registration_answers` field on `LumaGuest` type + `normalizeLinkedinAnswer()` private helper + exported `linkedinUrlFromGuest(g)` pure function. Handles: full URLs, `linkedin.com/in/x`, `/in/x`, `in/x`, bare handles. Returns null when absent.
- `src/lib/event-attendees.ts`: added `linkedinUrl: string | null` to `AttendeeValues` type; set `linkedinUrl: linkedinUrlFromGuest(g)` in `lumaGuestToAttendeeValues`.
- `src/lib/event-attendees-sync.ts`: added exported `matchEvaluationId(email, linkedinUrl)` — tries email first (via `matchEvaluationIdByEmail`), then matches `lower(evaluations.linkedin_url)` case-insensitively; updated `syncEventAttendees` to call `matchEvaluationId` instead of `matchEvaluationIdByEmail`; added `linkedinUrl` to both INSERT values and `onConflictDoUpdate` set.
- `tests/lib/luma-linkedin.test.ts`: 10 pure tests for `linkedinUrlFromGuest` — all pass.
- `tests/app/event-attendees-linkedin.test.ts`: 3 DB tests (`describe.skipIf(IS_PROD_DB)`) covering linkedin match, email-priority-over-linkedin, and linkedin stored on unmatched attendee.

### Potential concerns to address:
- **db:push blocked**: `pnpm db:push` hit an interactive TTY prompt about pre-existing `crunchbase`/`crunchbase_pending` columns on `evaluations` (dropped from schema.ts before this branch, still in dev DB). The `linkedin_url` ADD COLUMN migration is a separate clean SQL file; run it directly or apply `0053_charming_gwen_stacy.sql` manually. Once applied, all DB tests will pass.
- `evaluations.linkedin_url` stored format verified: `https://linkedin.com/in/<handle>` (no `www`, no trailing slash) — canonicalized at scoring time via `canonicalizeLinkedinUrl`. The `matchEvaluationId` matcher lowercases both sides (`lower(evaluations.linkedin_url)` vs `linkedinUrl.toLowerCase()`) for safety.

## Progress Update as of 2026-06-11 9:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wrote the design spec for capturing Luma LinkedIn URLs + auto-scoring registrants
on sync (credit-charged, with a pre-sync cost modal). See
`docs/superpowers/specs/2026-06-11-luma-autoscore-on-sync-design.md`. Building in
4 phases. No feature code yet.

### Detail of changes made:
- Design: add `event_attendees.linkedin_url`; capture from Luma
  `registration_answers` (defensive — degrades to today's behavior if absent);
  match by email→linkedin; auto-score unmatched-with-URL via a credit-charged
  scoring job (super-admins exempt via existing holdCreditsForJob); pre-sync
  preview modal shows count + cost; per-attendee "Score this LinkedIn".

### Potential concerns to address:
- Linchpin: Luma must return registration_answers — defensive design + the
  preview count self-diagnoses it. Couldn't verify the API shape directly.
- Additive prod migration (linkedin_url) — apply before code deploy.
