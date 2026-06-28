# event-slug-from-title

## Progress Update as of 2026-06-09 9:50 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
New Luma-synced events now derive their slug from the event TITLE (e.g.
"summer-founder-dinner") instead of Luma's opaque URL code (e.g. "id5j1bw0"),
with collision handling. Future-facing only — existing events keep their slug.

### Detail of changes made:
- `src/lib/luma-sync.ts`: extracted `eventSlugBase(ev)` (title → lu.ma URL slug →
  luma-<id> fallback) and added `uniqueEventSlug(base)` (appends -2/-3 on
  collision against the events.slug unique index). The sync now uses
  `uniqueEventSlug(eventSlugBase(ev))` on INSERT only; `onConflictDoUpdate` still
  omits slug, so existing events are untouched and old links never break.
- `tests/lib/luma-sync-slug.test.ts`: pure tests for the title-first priority +
  fallbacks, and DB-backed tests for the -2 collision suffix.

### Potential concerns to address:
- Existing events (incl. id5j1bw0) are unchanged by design; to give one a pretty
  URL, use the per-event slug editor (#288) — note it breaks that event's old
  shared links (no slug-alias redirect exists yet).
