# Event Attendee Management — Design

**Date:** 2026-06-09
**Status:** Approved design, pending implementation plan
**Branch:** `event-attendee-management`

## Problem

Today an event's attendee list is derived entirely from a **Luma guest-list
sync** (`POST /api/admin/events/sync-luma` → `syncEventAttendees()`), which writes
rows into `eventAttendees` and email-matches each guest to a Festival profile
(`evaluationId`). There is **no admin UI** to curate that list. Admins need to:

1. **See** the current attendee list for an event.
2. **Remove** people (e.g. RSVP'd on Luma but didn't actually attend).
3. **Add** people who attended but weren't on the Luma list — by searching
   existing Festival profiles, with a path to go score someone who isn't in the
   system yet.
4. **Re-Score All** attendees — kick off a bulk scoring job for everyone who
   attended, so their scores are fresh.

The hard constraint: the Luma sync is **idempotent and re-runnable** (it re-pulls
the full guest list each run via `onConflictDoUpdate` keyed on
`(eventId, lumaGuestApiId)`). Any manual edit must **survive a future re-sync** —
a naive hard delete would be resurrected, and a manual add must not be wiped.

## Scope

The admin manages the **approved / public** attendee list — the same set that
renders on the public event page (`resolveEventAttendeeEvalIds` already filters
to `approvalStatus = "approved"`). Luma "pending"/"declined" guests do not appear
unless an admin adds them manually. (Confirmed with user.)

Out of scope: editing a person's name/email inline, managing pending/declined
Luma states, attendee CSV import (Luma sync remains the bulk source).

## Data model (Approach A — augment `eventAttendees`)

Add two columns to the existing `eventAttendees` table:

| Column           | Type    | Default  | Meaning                                            |
|------------------|---------|----------|----------------------------------------------------|
| `source`         | text    | `"luma"` | `"luma"` (from sync) or `"manual"` (admin-added)   |
| `removedByAdmin` | boolean | `false`  | Soft-delete; hides the row from list + resolver    |

**Add** (admin picks a profile from search):
- Upsert a row keyed on `(eventId, lumaGuestApiId)` with a **synthetic key**
  `lumaGuestApiId = "manual:<evaluationId>"`. This reuses the existing unique
  constraint so the same profile can't be double-added, and **re-adding a
  removed person just un-deletes them** (`removedByAdmin = false`).
- Set `source = "manual"`, `evaluationId = <picked>`, `approvalStatus = "approved"`,
  and copy `name` / `email` from the profile (so it renders even before the next
  resolve pass).

**Remove** (any row, Luma or manual):
- Soft-delete: `removedByAdmin = true`. The Luma sync's `onConflictDoUpdate` set
  list does **not** touch `removedByAdmin`, so a removed Luma guest stays removed
  across re-syncs.

**Reads:**
- `resolveEventAttendeeEvalIds(eventId)` gains a `removedByAdmin = false` filter
  (alongside the existing `approvalStatus = "approved"`). This is the single
  choke point feeding the public attendee table, so the filter covers public
  rendering automatically.
- A new admin list query returns all non-removed rows for the event (matched and
  unmatched), each with: attendee row id, name, `source`, and — when matched —
  the linked profile's href + combined score.

**Why A over alternatives:**
- **B — separate `eventAttendeeOverrides` table** (added evalIds + removed ids):
  more normalized but forces a merge of two sources on every read and a more
  complex resolver. Rejected for added complexity with no real benefit at this
  scale.
- **C — snapshot & stop syncing** the event on first manual edit: decouples from
  Luma entirely but loses all future Luma updates (new RSVPs, check-ins).
  Rejected.

## UI — new "Attendees" section on `/admin/events/[id]`

Added to the existing single admin event page (which already hosts the applicant
queue + hosts/sponsors/photos/priorities/learnings). Placed in the recap/content
area since the attendee list is a public-recap feature.

Section contents:
- **Header row:** "Attendees" title + a **Re-Score All** button (right-aligned).
- **Add search box** (top of the section): behaves like the global header search
  (`HeaderSearch`). Typing runs a debounced query against the existing
  `/api/leaderboard/search?q=…`, showing matching profiles in a dropdown.
  Clicking a result **adds them as an attendee** (optimistic, then
  `router.refresh()`), instead of navigating to their profile. When nothing
  matches, it renders the shared `ScoreThemPrompt` (→ `/?name=…`) so the admin
  can go score that person, then come back and add them once they exist.
- **List:** the current non-removed attendees. Each row shows name, the linked
  profile + combined score (or a greyed "unmatched" hint if no `evaluationId`), a
  `Luma` / `Manual` source tag, and a **Remove** button (soft-delete, optimistic).

Implementation: the list is **server-rendered** into the page (like hosts /
priorities), and a client component handles the add-search + remove + re-score
interactions. The add-search component is a focused admin sibling of
`HeaderSearch` — it shares the `/api/leaderboard/search` backend and the
`ScoreThemPrompt` empty state, but its result action is "add" rather than
"navigate." (Small, deliberate duplication of the dropdown shell to avoid
threading an `onSelect` mode through the global header component.)

## Re-Score All

Mirrors the existing `POST /api/admin/rescore-all`, which creates **one async
scoring job** with one pre-resolved item per profile; the `scoring-tick` cron
drains it (~5 items/min), calling `reEvaluate()` and updating each evaluation in
place.

**Endpoint:** `POST /api/admin/events/[id]/rescore-attendees`, body `{ model? }`
(default `"sonnet"`).
- **Auth:** `requireGrant("run_scoring_jobs")` + `canAccessEvent(id)`, and reject
  user-scoped roles — same gating as `rescore-all`, stricter than the
  `manage_events` grant used by add/remove because it spends credits.
- **Selection:** gather `evaluationId`s from non-removed attendees of this event,
  then fetch the evals filtered to `source = "url"` (skip manually-entered
  `source = "code"` scores, which `reEvaluate` refuses). Unmatched names are
  skipped (nothing to score).
- **Enqueue:** create a `scoringJobs` row titled *"Re-score event attendees —
  \<event title\>"* with `status = "queued"`, estimate + hold credits (reuse the
  `rescore-all` helpers), then insert one `scoringJobItems` row per eval with
  `status = "resolved"`, `linkedinUrl` + `evaluationId` pre-filled, chunked 200 at
  a time.
- **Response:** `{ jobId, count, estimatedCents }`.

**Button UX:** disabled when there are 0 matched attendees. On click, confirm
with the count + estimated cost; on success show "Queued N attendees — scoring
runs in the background." Scores update in place as the cron drains; if a
scoring-job detail page exists, link to it via `jobId`.

## Endpoints summary

| Endpoint | Method | Auth | Body | Purpose |
|----------|--------|------|------|---------|
| `/api/admin/events/[id]/attendees` | POST | `manage_events` + `canAccessEvent` | `{ evaluationId }` | Add/un-remove a manual attendee (upsert) |
| `/api/admin/events/[id]/attendees/[attendeeId]` | DELETE | `manage_events` + `canAccessEvent` | — | Soft-delete (remove) an attendee |
| `/api/admin/events/[id]/rescore-attendees` | POST | `run_scoring_jobs` + `canAccessEvent`, non-user-scoped | `{ model? }` | Enqueue a bulk re-score job for matched attendees |

All return `{ error }` + appropriate status on auth/validation failure, matching
the existing admin-event route conventions.

## Data flow

```
Luma sync ─┐
           ├─► eventAttendees (source, removedByAdmin, evaluationId, …)
admin add ─┘        │
admin remove ───────┤ (removedByAdmin = true)
                    ▼
   resolveEventAttendeeEvalIds(eventId)   ← filters approved + !removedByAdmin
                    ├──► public AttendeesTable (event page)
                    └──► admin Attendees section + Re-Score All selection
                                  │
                                  ▼
                    rescore-attendees ─► scoringJobs + scoringJobItems
                                  ▼
                    scoring-tick cron ─► reEvaluate() updates evaluations in place
```

## Migration

A Drizzle migration adds `source` (text, default `'luma'`, not null) and
`removed_by_admin` (boolean, default false, not null) to `event_attendees`.
Backfill is implicit via defaults (all existing rows become `source='luma'`,
`removed_by_admin=false`). Generate with the project's Drizzle workflow; apply to
the dev Neon DB; prod migration runs through the normal deploy path (never
`db:push` from a checkout).

## Testing

- **Unit (pure):** extend `resolveEventAttendeeEvalIds` coverage — a removed row
  is excluded; a manual row's `evaluationId` is included; dedup when the same
  evalId appears as both a Luma and a manual row.
- **Re-sync survival:** simulate add → Luma re-sync upsert → row remains
  `source='manual'`/un-removed; remove a Luma guest → re-sync → stays removed.
- **Endpoint validation:** add rejects a missing/garbage `evaluationId`; remove
  is idempotent; rescore-attendees skips unmatched + `source='code'` evals and
  returns the right `count`.
- Follow the repo's existing vitest setup and the `scoring-tick` / `rescore-all`
  test patterns where present.

## Open risks / notes

- **Synthetic Luma key collision:** `"manual:<evalId>"` namespace can't collide
  with real Luma `gst-…` ids. Safe.
- **Double-count guard:** if a person exists as both an approved Luma row and a
  manual row (same evalId), `resolveEventAttendeeEvalIds` dedupes via a `Set`, so
  they appear once. The admin list should likewise key by `evaluationId` for
  matched rows to avoid showing a dupe.
- **Cost visibility:** Re-Score All spends credits; the confirm step must show the
  estimate, and the endpoint must surface the insufficient-credit error the way
  `rescore-all` does.
- **Page length:** the admin event page is already long; the Attendees section
  adds more. Acceptable for now; revisit with in-page nav if it keeps growing.
