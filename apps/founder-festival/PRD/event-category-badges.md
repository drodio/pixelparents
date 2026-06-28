# Event category badges (assign, display, filter)

## Progress Update as of 2026-06-10 3:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Events can now carry category badges (Intimate dinner / Mixer / Family friendly …):
created inline while editing an event, shown on the cards + the event page, and
clickable to filter the /events list via a left-rail filter.

### Detail of changes made:
- Migration `0052_lethal_barracuda.sql`: `event_badges` (id, name, slug unique) +
  `event_badge_links` (event_id, badge_id, PK). Apply via `node scripts/apply-event-badges.cjs`
  (dev: .env.local; prod: pass `/Users/.../.env.prod.local`). Reads are try/caught so pages
  don't 500 pre-migration, but apply to prod BEFORE merge so the feature works on deploy.
- `lib/event-badges-catalog.ts`: `slugifyBadge`, `listAllBadges`, `getBadgesForEvent`,
  `getBadgesForEvents` (batch, for the listing), `setBadgesForEvent` (creates missing badges
  inline, deduped by slug, resets links). NOTE: distinct from the printed name-tag
  `lib/event-badges.ts`.
- Admin: `EventBadgePicker` (inline tag input, autocomplete from the vocabulary, create-on-Enter,
  auto-saves) + a "Badges" section on the admin event page. APIs: `GET /api/admin/event-badges`
  (catalog) and `GET|PUT /api/admin/events/[id]/badges-tax` (the event's badges).
- Public listing `/events`: left-rail `EventBadgeFilter` (multi-select, OR, URL-driven
  `?badge=slug`), cards show clickable badge pills (card restructured so pills aren't nested in
  the card link), and the list filters by selected badges.
- Event detail page: badge pills under the title / above the photos, clickable to the filtered list.

### Design decisions:
- Inline badge creation (chosen "A") with case-insensitive slug de-dup ("Mixer" == "mixer").
- Multi-badge filter = OR (match any). Clicking a single badge filters to that one.

### Potential concerns to address:
- No admin "delete/rename badge" UI yet — badges are only created/attached. A stray badge stays
  in the vocabulary (and the filter rail) until manually removed in the DB. Add a manage page if
  the vocabulary gets messy.
