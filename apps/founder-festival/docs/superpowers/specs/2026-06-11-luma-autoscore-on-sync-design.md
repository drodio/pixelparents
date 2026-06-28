# Auto-score Luma registrants on sync — Design

**Date:** 2026-06-11
**Status:** Approved (user requested all items + auto-score + credit-charged pre-sync modal)
**Branch:** `luma-autoscore-on-sync`

## Problem

When a Luma event is synced, registrants who aren't already a scored profile show
as "unmatched" in the admin tool. Today we (a) never auto-score registrants, (b)
match only by email then exact name, and (c) **throw away the LinkedIn URL Luma
collects** (the "What is your LinkedIn profile?" registration answer). The single
most reliable identifier is sitting in Luma and unused.

## Goals

1. **Capture** each registrant's LinkedIn URL (+ email/name) from Luma on sync.
2. **Match** unmatched attendees to existing profiles by LinkedIn URL (in addition
   to email/name).
3. **Auto-score** unmatched registrants who have a LinkedIn URL — enqueue a
   scoring job; the cron scores the exact URL and links the new eval back.
4. **Charge credits** for the auto-scoring: non-super-admins are charged, super
   admins are exempt (the existing `holdCreditsForJob` already does this).
5. **Pre-sync modal**: before scoring runs, show how many profiles will be scored
   and the total expected cost to the syncing admin.
6. **Per-attendee "Score this LinkedIn"**: in the admin unmatched-attendee UI,
   surface the captured email + LinkedIn URL and a one-click button that scores
   that exact URL and links it.

## Key existing facts (verified)

- `holdCreditsForJob(clerkUserId, estimateCents)` returns `{kind:"ok",
  creditHoldCents:null}` for privileged users (super-admins + env admins) — **no
  charge** — and reserves credits for everyone else (`{kind:"insufficient",…}`
  when the balance is short). Job completion reconciles the hold to actual cost.
- `estimateJobCents(count, model)` ≈ `count × (median recent cost | fallback)`;
  fallback cents: `opus 35`, `sonnet 13`. Default scoring model: `sonnet`.
- The scoring cron (`scoring-tick`) claims `scoringJobItems` with `status IN
  ('pending','resolved')`. A **fresh URL** item = `status:'pending'`,
  `linkedinUrl` set, `evaluationId:null`; the cron calls `runEval(linkedinUrl,
  "url",{model})` → creates an `evaluations` row, returns `{evaluationId,…}`.
- After scoring a fresh URL, the cron already links it to `event_applicants`
  (`where linkedinUrl = url AND status='pending'` → set evaluationId + status).
  We mirror this for `event_attendees` (link by linkedin_url where evaluationId is
  null — attendees have no pending/scored status to flip).
- `SyncLumaButton` (`src/components/admin/SyncLumaButton.tsx`) POSTs
  `/api/admin/events/sync-luma` (auth `isAdmin()`), used on `/admin/events`.

## ⚠️ Linchpin assumption (defensive)

The feature depends on Luma's `/event/get-guests` returning the registration
answers (incl. the LinkedIn question). We could not verify the exact shape
against the live API. **Design defensively:** `linkedinUrlFromGuest(g)` reads a
best-effort `registration_answers` array and returns `null` when absent — so if
Luma returns nothing, attendees behave exactly as today (no capture, no
auto-score, nothing breaks). The **preview count self-diagnoses** capture: the
sync modal shows "N profiles will be scored"; N≈(visible LinkedIn URLs) confirms
capture works, N=0 means the extraction/field path needs adjusting.

## Data model

Add to `event_attendees`:
- `linkedin_url` (text, nullable) — normalized `https://www.linkedin.com/in/<handle>`
  captured from Luma. Additive migration, safe.

## Luma capture

- Extend `LumaGuest` (`src/lib/luma.ts`) with an optional
  `registration_answers?: Array<{ label?: string|null; question?: string|null;
  answer?: string|null }>` (loosely typed; Luma returns more).
- New pure helper `linkedinUrlFromGuest(g): string | null` (in `src/lib/luma.ts`
  or `event-attendees.ts`):
  - Scan `registration_answers` for an entry whose label/question contains
    "linkedin" (case-insensitive) OR whose answer matches a LinkedIn pattern
    (`linkedin.com/in/…` or a bare `/in/<handle>` or `in/<handle>`).
  - Normalize to `https://www.linkedin.com/in/<handle>` (strip query/trailing
    slash, lowercase host+path) reusing the existing LinkedIn-normalization
    helper if one exists (`isValidLinkedinUrl`/`extractLinkedinHandle`).
  - Return null if none found / unparseable.
- `lumaGuestToAttendeeValues` includes `linkedinUrl: linkedinUrlFromGuest(g)`.
- The sync upsert sets/refreshes `linkedin_url`.

## Matching (sync)

Extend the sync match: `matchEvaluationId(email, linkedinUrl)`:
1. email → `profileEmails.evaluationId`, then `evaluations.foundEmail`.
2. else linkedinUrl → `evaluations.linkedinUrl` (exact, normalized).
Stored on the attendee row as today. (The read-time unique-name fallback in
`resolveEventAttendeeEvalIds` is unchanged.)

## Auto-score on sync + credits + preview

Two-call flow from `SyncLumaButton`:

**Call 1 — preview** `POST /api/admin/events/sync-luma/preview` (auth `isAdmin()`):
- Read-only: fetch Luma events + guests, capture each guest's LinkedIn URL, and
  count guests who are **not already matched** (by email or linkedin in our DB)
  **and have a LinkedIn URL** → `toScore` (deduped by URL). No DB writes.
- Returns `{ events, guests, toScore, estimatedCents, willCharge }` where
  `estimatedCents = estimateJobCents(toScore, "sonnet")` and `willCharge =
  !isSuperAdmin/privileged`.

**Modal** (in `SyncLumaButton`): "Sync will import {events} events / {guests}
guests and score {toScore} new profiles" + (willCharge ? "~$X.XX will be charged
to you." : "No charge (super-admin)."). Buttons: Cancel / Sync & Score. (If
toScore=0, the modal still confirms the plain data sync.)

**Call 2 — sync** `POST /api/admin/events/sync-luma` (existing route, enhanced):
- Run the real data sync (events + attendees, capture linkedin, match) — free.
- Collect the to-score set: attendees with `evaluationId IS NULL` AND a
  `linkedin_url` that isn't already an existing evaluation; dedupe by URL.
- If non-empty: `holdCreditsForJob(clerkUserId, estimateJobCents(n,"sonnet"))`.
  - `insufficient` → return 402 `{error:"insufficient_credits", …}` (data sync
    already done; scoring skipped). Modal/preview already showed the cost.
  - `ok` → create a `scoringJobs` row (title "Auto-score Luma registrants — <date>")
    + one `scoringJobItems` per URL (`status:'pending'`, `linkedinUrl` set,
    `evaluationId:null`), chunked 200.
- Returns `{ synced, attendees, matched, scored, jobId }`.

**Cron link-back** (`scoring-tick`): after scoring a fresh URL, mirror the
applicant block for attendees:
```
const atts = await db.select().from(eventAttendees)
  .where(and(eq(eventAttendees.linkedinUrl, linkedinUrl), isNull(eventAttendees.evaluationId)));
for (const a of atts) {
  await db.update(eventAttendees).set({ evaluationId: result.evaluationId, updatedAt: new Date() })
    .where(eq(eventAttendees.id, a.id));
}
```
(No status flip / auto-rule — attendees aren't applicants.)

## Per-attendee "Score this LinkedIn"

- `listEventAttendeesAdmin` (`src/lib/event-attendees-admin.ts`) includes
  `linkedinUrl` and `email` on each `AdminAttendeeRow`.
- `AttendeeManager` unmatched row: show the captured email + LinkedIn URL (link),
  and a **"Score this LinkedIn"** button when `linkedinUrl` present.
- New `POST /api/admin/events/[id]/attendees/[attendeeId]/score`
  (auth `manage_events` + `canAccessEvent`): reads the attendee's `linkedin_url`;
  enqueues a 1-item scoring job (credit hold via `holdCreditsForJob`); the cron
  scores + links back (same path as auto-score). Returns `{jobId}` or 402.
- The existing name-search "Score them now" stays as the fallback when there's no
  captured URL.

## Shared helper

`enqueueAttendeeScoring(linkedinUrls: string[], clerkUserId, model="sonnet")` in
a lib (e.g. `src/lib/event-attendees-admin.ts` or a new `attendee-scoring.ts`):
dedupes, estimates, holds credits, creates the job + items, returns `{kind:"ok",
jobId, count, estimatedCents}` or `{kind:"insufficient", …}`. Used by both the
sync route and the per-attendee endpoint.

## Files

- **Migration:** `event_attendees.linkedin_url`.
- **Modify** `src/lib/luma.ts` — `registration_answers` on `LumaGuest`,
  `linkedinUrlFromGuest`.
- **Modify** `src/lib/event-attendees.ts` — `lumaGuestToAttendeeValues` adds
  linkedinUrl; `AttendeeValues` type.
- **Modify** `src/lib/event-attendees-sync.ts` — capture linkedin on upsert;
  `matchEvaluationId(email, linkedin)`; return the to-score set.
- **Modify** `src/db/schema.ts` — column.
- **Create** `src/lib/attendee-scoring.ts` — `enqueueAttendeeScoring`.
- **Modify** `src/app/api/admin/events/sync-luma/route.ts` — auto-score enqueue +
  hold; **Create** `.../sync-luma/preview/route.ts`.
- **Modify** `src/app/api/cron/scoring-tick/route.ts` — attendee link-back.
- **Modify** `src/components/admin/SyncLumaButton.tsx` — preview → modal → sync.
- **Modify** `src/lib/event-attendees-admin.ts` — `AdminAttendeeRow` +
  linkedinUrl/email; **Create** `.../attendees/[attendeeId]/score/route.ts`;
  **Modify** `src/components/admin/AttendeeManager.tsx` — show URL + Score button.

## Testing

- **Pure:** `linkedinUrlFromGuest` — finds the LinkedIn answer by label, by
  answer pattern, normalizes `/in/x`, returns null when absent. `matchEvaluationId`
  — email wins, else linkedin, else null.
- **DB:** sync captures linkedin_url + links by linkedin when email misses;
  `enqueueAttendeeScoring` creates a job with N pending items + a credit hold
  (mock the hold/super-admin); cron link-back sets evaluationId on attendees with
  the scored URL.
- **Preview:** returns toScore=0 when everyone matches; >0 with an unmatched
  linkedin guest (mock `listLumaGuests`).
- UI (modal, score button): build + manual.

## Risks / notes

- **Luma shape (linchpin):** defensive + self-diagnosing (above).
- **Cost surprise:** the modal is the guard; the route also re-checks credits
  (402) so a stale modal can't overspend.
- **Dedup:** dedupe to-score URLs across events so a person registered for two
  events is scored once.
- **Idempotent re-sync:** auto-score only targets attendees still unmatched with a
  URL not already an eval; re-syncs won't re-score people already linked.
- **Junk registrants:** auto-score scores everyone with a URL incl. no-shows; the
  cost modal makes that explicit. (A future "approved-only" filter could narrow
  it; out of scope unless requested.)
