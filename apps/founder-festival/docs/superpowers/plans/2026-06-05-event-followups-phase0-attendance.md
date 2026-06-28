# Event Followups — Phase 0: Attendance Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Every Luma-sourced event knows who registered, their RSVP status, and (if scanned) check-in — stored in a new `event_attendees` table and matched to Founder Festival profiles by email.

**Architecture:** Extend the read-only Luma client with a paginated `get-guests` call. A pure mapper turns a Luma guest into an `event_attendees` row (status normalization, email lowercasing, date parsing). A sync routine iterates Luma-sourced events, fetches guests, matches `evaluation_id` by email (`profile_emails` then `evaluations.found_email`), and upserts idempotently keyed on `(event_id, luma_guest_api_id)`. An admin API route triggers the sync and returns per-event counts.

**Tech Stack:** Next.js 16, Drizzle (neon-http), Vitest. Mirrors `src/lib/luma.ts` + `src/lib/luma-sync.ts`.

---

## File structure

- `src/lib/luma.ts` (modify) — add `LumaGuest` type + `listLumaGuests(eventApiId)`.
- `src/lib/event-attendees.ts` (create) — pure mappers: `mapApprovalStatus`, `lumaGuestToAttendeeValues`.
- `src/db/schema.ts` (modify) — add `eventAttendees` table.
- `drizzle/00NN_*.sql` (generated) — migration.
- `src/lib/event-attendees-sync.ts` (create) — `syncEventAttendees()` (DB matching + upsert).
- `src/app/api/admin/events/sync-luma/route.ts` (modify) — also sync guests; return counts.
- `tests/lib/event-attendees.test.ts` (create) — pure-function tests.
- `tests/app/event-attendees-sync.test.ts` (create) — DB integration (self-skips on prod).

---

### Task 1: Luma `get-guests` client

**Files:** Modify `src/lib/luma.ts`.

- [ ] **Step 1:** Add a `LumaGuest` type capturing `api_id`, `approval_status`, `email`, `name`,
  `user_first_name`, `user_last_name`, `user_api_id`, `registered_at`, `checked_in_at`.
- [ ] **Step 2:** Add `listLumaGuests(eventApiId: string): Promise<LumaGuest[]>` that calls
  `/event/get-guests?event_api_id=…` following `next_cursor`/`has_more` (max 50 pages, like
  `listLumaEvents`). Each entry's guest fields live both top-level and under `.guest`; normalize
  to flat `LumaGuest`. Reuse the existing `lumaGet` helper.
- [ ] **Step 3:** `pnpm exec tsc --noEmit` to typecheck. Commit.

### Task 2: Pure guest→attendee mapper (TDD)

**Files:** Create `src/lib/event-attendees.ts`, `tests/lib/event-attendees.test.ts`.

- [ ] **Step 1 (failing test):** Test `mapApprovalStatus` maps Luma values
  (`approved`/`pending`/`declined`/unknown → `approved`/`pending`/`declined`/`pending`) and
  `lumaGuestToAttendeeValues` lowercases email, parses `registered_at`/`checked_in_at` (null-safe),
  carries `lumaGuestApiId`/`lumaUserApiId`/`name`, and sets `evaluationId: null` (matching is a
  later DB step).
- [ ] **Step 2:** `pnpm test tests/lib/event-attendees.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement the two pure functions. Reuse `normalizeEmail` from `@/lib/profile-emails`.
- [ ] **Step 4:** Re-run → PASS. Commit.

### Task 3: `event_attendees` schema + migration

**Files:** Modify `src/db/schema.ts`; generate migration.

- [ ] **Step 1:** Add `eventAttendees` pgTable: `id` uuid PK; `eventId` uuid→events cascade;
  `evaluationId` uuid→evaluations (nullable, no cascade); `lumaGuestApiId` text; `lumaUserApiId`
  text; `email` text; `name` text; `approvalStatus` text; `registeredAt` tstz; `checkedInAt` tstz
  (nullable); `lumaUrl` text; `createdAt`/`updatedAt` tstz defaultNow notNull. Indexes:
  uniqueIndex `event_attendees_event_guest_unique (event_id, luma_guest_api_id)`;
  index `event_attendees_event_idx (event_id)`; index `event_attendees_evaluation_idx (evaluation_id)`.
- [ ] **Step 2:** `pnpm run db:generate` → new `drizzle/00NN_*.sql`. Inspect it (only CREATE TABLE
  + indexes; no drops).
- [ ] **Step 3:** Apply to local dev DB: `pnpm exec drizzle-kit migrate` (or `db:push` against dev).
  Verify table exists.
- [ ] **Step 4:** Commit schema + migration.

### Task 4: `syncEventAttendees()` (TDD, DB integration)

**Files:** Create `src/lib/event-attendees-sync.ts`, `tests/app/event-attendees-sync.test.ts`.

- [ ] **Step 1:** Implement a `matchEvaluationIdByEmail(email)` helper: query `profile_emails` by
  normalized email → `evaluation_id`; fallback to `evaluations.found_email` (lowercased). Return
  `string | null`.
- [ ] **Step 2:** Implement `syncEventAttendees({ lumaClient? })`: select Luma-sourced events
  (`source='luma'`, `lumaEventId` not null); for each, `listLumaGuests(lumaEventId)`; map each via
  `lumaGuestToAttendeeValues`; resolve `evaluationId` via the matcher; upsert
  `onConflictDoUpdate` target `(event_id, luma_guest_api_id)` refreshing status/checkedInAt/
  evaluationId/updatedAt. Inject the Luma fetch fn for testability (default `listLumaGuests`).
  Return `{ events: n, attendees: total, matched: m }`.
- [ ] **Step 2 (test):** `describe.skipIf(IS_PROD_DB)` — seed an evaluation + profile_email + a
  `source='luma'` event; call `syncEventAttendees` with a stub Luma client returning 2 guests (one
  whose email matches the seeded profile_email, one that doesn't); assert 2 attendee rows, one with
  `evaluationId` set, one null; re-run and assert still 2 rows (idempotent) with updated status.
- [ ] **Step 3:** `pnpm test tests/app/event-attendees-sync.test.ts` (add `--no-file-parallelism`
  if Neon times out). Iterate to PASS. Commit.

### Task 5: Wire into admin sync + counts

**Files:** Modify `src/app/api/admin/events/sync-luma/route.ts`; surface counts in
`src/app/(authed)/admin/events/page.tsx` (attendee count per event).

- [ ] **Step 1:** After `syncLumaEvents()`, call `syncEventAttendees()`; return
  `{ synced, attendees, matched }`.
- [ ] **Step 2:** On the admin events list, show attendee count + matched count per Luma event
  (lightweight `count()` query grouped by event).
- [ ] **Step 3:** `pnpm exec tsc --noEmit` + `pnpm run lint`. Commit.

### Task 6: End-to-end verification on dev

- [ ] **Step 1:** Run the sync against the 3 real June events (dev DB) via a one-off `tsx` script or
  the admin route on :3003; confirm `event_attendees` populates with correct RSVP statuses and some
  matched profiles. Record counts in the PRD journal. Do NOT commit the throwaway script.

---

## Self-review

- **Spec coverage:** Covers PRD §4 `event_attendees`, §3 Luma get-guests, §6 Phase 0 acceptance
  (RSVP statuses, email match, idempotent). ✓
- **Placeholders:** none.
- **Type consistency:** `lumaGuestToAttendeeValues` output shape = `eventAttendees` insert columns;
  `listLumaGuests` name used in Task 1 and Task 4. ✓
