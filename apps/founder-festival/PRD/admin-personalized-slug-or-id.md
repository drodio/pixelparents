# Fix: admin personalized eval page 500 when reached by slug

## Progress Update as of 2026-06-10 7:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
`/admin/events/<id>/personalized` now resolves the event by UUID OR public slug, fixing the
server-render 500 when reached via the slug (e.g. /admin/events/9nj5he2k/personalized).

### Detail of changes made:
- The admin `[id]` segment expects the event UUID; reaching it with a slug made
  `getEventById(slug)` query a uuid column with a non-UUID string → Postgres error → 500.
- Page now: `UUID? getEventById : getEventBySlug`, then uses the resolved `event.id` for
  `canAccessEvent`, the back link, and the `<PersonalizedEval eventId>` (so the API gets the
  real UUID, not the slug).

### Potential concerns to address:
- Other admin event subpages (e.g. /badges) still expect the UUID; only the personalized eval
  page is slug-tolerant. Reach others via the in-app links (which use the UUID).
