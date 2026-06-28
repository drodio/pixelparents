# PRD — admin-events-section

## Progress Update as of 2026-06-06 01:06 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Reorganized the admin LEFT NAV: added an "Events:" section header
(same style as "Superadmin:") sitting above the Superadmin section, and moved
"Manage Events" under it. "Hosts" and "Sponsors" — previously buttons at the top
of the /admin/events page — are now left-nav items in that Events section.

### Detail of changes made:
- `src/lib/admin-nav.ts`: `section` type gains `"events"`. "Manage Events" moved
  from `main` → `events`. Added `/admin/hosts` (Hosts) and `/admin/sponsors`
  (Sponsors) items in the `events` section, gated on the same events grants
  (create_events / manage_events / delete_events).
- `src/components/admin/AdminNav.tsx`: render an "Events:" section (header +
  links, same `text-xs uppercase tracking-[0.2em] text-zinc-600` treatment as
  "Superadmin:") between the main items and the Superadmin section, in both the
  desktop sidebar and the mobile drawer (they share one `navLinks` list).
- `src/app/(authed)/admin/events/page.tsx`: removed the Hosts + Sponsors top
  buttons (now in the left nav); kept Sync-from-Luma and "+ New event".
- `tests/lib/admin-nav.test.ts`: updated the manage_events expectation to include
  /admin/hosts + /admin/sponsors.

### Verification done:
- `next build` compiles + typechecks; `tests/lib/admin-nav.test.ts` 9/9 pass.

### Potential concerns to address:
- Hosts/Sponsors are gated on the broad events grants (same as Manage Events);
  if they should be superadmin-only or create-only, tighten `anyGrant`.
