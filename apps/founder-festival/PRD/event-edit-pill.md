# event-edit-pill

## Progress Update as of 2026-06-12 9:20 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
On the public event page, an admin who can manage the event now sees a floating
"Edit event" pill (the same bottom-left AdminProfileBox used on profile pages)
linking to the admin edit page.

### Detail of changes made:
- `src/app/(authed)/events/[slug]/page.tsx`: compute
  `canEditEvent = can("manage_events") && canAccessEvent(event.id)`; when true,
  render `<AdminProfileBox><a href="/admin/events/{id}">Edit event</a></AdminProfileBox>`.
  Reuses the existing floating admin toolbar (fixed bottom-left, minimizable).

### Potential concerns to address:
- Gate respects RBAC scope (canAccessEvent), so "theirs"-scoped admins only see it
  on events they can access. Non-admins see nothing.
