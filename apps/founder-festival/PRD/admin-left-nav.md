# Branch: `admin-left-nav` — progress log

Branched from `main` on 2026-05-26.

Replaces the admin top-bar nav with a left sidebar; every section is RBAC-gated
and selectable per role.

## Progress Update as of 2026-05-26 6:20 PM Pacific
*(Most recent updates at top)*

### Summary
Admin home (`/admin/page.tsx`): vertically center the two hub cards in the main
area (wrapped the grid in `min-h-full flex items-center`).

## Progress Update as of 2026-05-26 6:12 PM Pacific
*(Most recent updates at top)*

### Summary
Left admin nav: "admin" title, then Bulk Score / Manage Events (with icons),
then a "Superadmin:" group (Pending Items / Profiles / Admin Users / Admin
Roles). Each item is a gold link, white when active. All sections are gated by
RBAC grants so roles can toggle visibility.

### Detail of changes made:
- `grants.ts`: +2 grants — `view_profiles` ("View scored profiles") and
  `manage_pending` ("Review pending items") — so every nav section has a
  controlling grant. They show up in /admin/roles automatically (RolesManager
  maps the catalog).
- `lib/admin-nav.ts` (+test, TDD): `ADMIN_NAV` catalog (href/label/section/
  anyGrant), `visibleNavItems(grants)`, `isActiveNav(pathname, href)` (matches
  the section + nested routes, not prefix siblings).
- `components/admin/AdminNav.tsx` (client): left sidebar; usePathname for the
  active item (gold `#dfa43a` → white when active); FiZap / FiCalendar icons on
  the two main items; DEV/PROD badge at the bottom.
- `admin/layout.tsx`: sidebar layout (flex aside+main); resolves the viewer's
  grants via `getViewerGrants()` and hands them to AdminNav. **Removed
  "← Back to site."**
- Page enforcement: `/admin/profiles` gated on `view_profiles`, `/admin/pending`
  on `manage_pending` (so a hidden section can't be reached by URL).

### Gating model (per DROdio)
RBAC for ALL sections, no literal super-admin gate: Bulk Score →
run_scoring_jobs; Manage Events → any events grant; Pending → manage_pending;
Profiles → view_profiles; Admin Users → approve_admin_requests; Admin Roles →
create_roles||edit_roles. Super-admins/env-admins get all grants.

### Verification:
- TDD: `admin-nav.test.ts` (visibleNavItems + isActiveNav). tsc + eslint clean;
  all admin routes compile (200). No migration. Visual to confirm in-browser.
