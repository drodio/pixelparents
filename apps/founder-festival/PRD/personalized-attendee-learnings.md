# Personalized learnings per attendee (admin, Chief) + expandable rows

## Progress Update as of 2026-06-11 10:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Admin can generate Chief personalized learnings for every attendee of an event via a
"Generate Personalized Learnings" button (left of "Re-Score All"), and view each in an
expandable attendee row. Results are stored.

### Detail of changes made:
- Migration `0055_chilly_stone_men.sql`: `event_personalized_learnings` (event_id, evaluation_id
  unique, method, html, generated_at).
- `lib/personalized-store.ts`: `storePersonalizedLearning` (upsert) + `getStoredPersonalizedForEvent`
  (keyed by eval id; deploy-safe → {} if table missing, so the admin page never 500s).
- Admin personalized API now persists each generated result (chief/ai).
- `AttendeeManager`: "Generate Personalized Learnings" button (left of Re-Score) loops matched
  attendees sequentially via the Chief API, with progress; attendee rows are expandable (chevron)
  and show the stored learnings + a per-row Generate / Re-generate.
- Admin event page loads `getStoredPersonalizedForEvent` → passes `initialLearnings`.

### Batch run:
- `scripts/generate-personalized-for-event.cjs <eventId>` — self-contained (Chief creds from
  .env.local, prod DB from .env.prod.local), creates the table if missing, resumable (skips
  already-generated). Used to pre-populate one event while the user is away.

### Potential concerns to address:
- Chief is slow (minutes/attendee) + costs credits; the button keeps the tab open and runs
  sequentially. For prod button use, CHIEF_API_TOKEN/CHIEF_PROJECT_ID must be in Vercel env.
- Stored HTML is from Chief (told to emit clean HTML); light-sanitized on the batch path.
