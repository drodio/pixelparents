# Org badges (host/sponsor-defined) + bulk apply — design

**Date:** 2026-06-09 · **Branch:** `org-badges` · **Status:** approved (DROdio, build-while-away)

## Goal
Admins can define custom badges on a host or sponsor (e.g., "District Member" on
the District host), and bulk-apply them to scored profiles. Super-admins can
apply all org badges; other admins can only apply badges of the hosts/sponsors
they're associated with. No points / no rescore (badges carry no points here).

## Decisions (resolved while user away — flag for review)
- **Bulk-apply lives in `ProfilesScoredTable`** (rendered on `/admin/profiles`),
  which is what actually has the filter + Export CSV the user described. (User
  linked `/admin/profiles/new`, but that's the job-creation form.)
- **"All profiles below" = the rows currently in the table** (after the active
  client-side filter). The action POSTs those evaluation ids.
- **Super-admins apply ALL org badges** (every host's + sponsor's custom badges),
  not the auto-computed catalog (those are data-derived; bulk-applying them is
  nonsensical). Scoped admins: only their associated orgs' badges.
- **Custom badges render as gold "identity"-category pills.**

## Data model (2 new tables)
```
org_badges                              -- custom badges owned by a host/sponsor
  id uuid pk
  owner_type text  -- 'host' | 'sponsor'
  owner_id   uuid  -- hosts.id / sponsors.id
  label      text
  created_at, updated_at
  index (owner_type, owner_id)

admin_org_assignments                   -- which hosts/sponsors an admin may badge
  id uuid pk
  clerk_user_id text   -- the admin (matches adminAccess.clerkUserId / auth())
  owner_type   text    -- 'host' | 'sponsor'
  owner_id     uuid
  created_at
  unique (clerk_user_id, owner_type, owner_id)
```
Applying an org badge to a profile = a `badge_overrides` row with
`badgeId = "org:<org_badge_id>"`, `status = "confirmed"`, `editedLabel = label`.
Un-applying = delete those rows. (`admin_access.name` already exists — no column
add.) Migration is additive → idempotent `CREATE TABLE IF NOT EXISTS`; dev now,
prod by DROdio before deploy (never db:push).

## Rendering custom badges
`computeBadges(inputs, overrides, extraCatalog?)` — new optional `extraCatalog`
(`Record<badgeId,{category,defaultLabel}>`) merged with `BADGE_CATALOG` in the
"owner-added badges" loop so `org:<id>` overrides surface (category "identity").
A loader `getOrgBadgeCatalog()` returns `{ "org:<id>": {category:"identity",
defaultLabel: label} }` for all org badges; the profile page + scored table pass
it to computeBadges so applied org badges show.

## Authorization
`authorizedOrgBadges(): OrgBadge[]` — super-admin (isSuperAdmin) → all org_badges;
else → org_badges whose (owner_type, owner_id) is in the viewer's
admin_org_assignments. Empty for unassigned non-super admins.

## Pieces
1. **Schema + render foundation** (above).
2. **Host/sponsor badge editor**: `OrgBadgeEditor` (add label / delete) on the
   host (`/admin/hosts/[id]`) + sponsor (`/admin/sponsors/[id]`) pages;
   `POST/DELETE /api/admin/org-badges`. lib `org-badges.ts`.
3. **Admin detail page**: Edit button on `AdminAccessTable` rows →
   `/admin/access/[id]`: edit `name`, multiselect associate hosts/sponsors.
   `POST /api/admin/access/[id]` (name + assignments). lib `admin-assignments.ts`.
4. **Bulk-apply**: section atop `ProfilesScoredTable` ("Apply these badges to all
   profiles below:") listing `authorizedOrgBadges`; click toggles apply/undo for
   all listed eval ids via `POST /api/admin/badges/bulk` ({ badgeId, evaluationIds,
   action:"apply"|"remove" }), super-admin or assignment-gated per badge.

## Auth gates
All write routes require an admin (adminGate/grants). Org-badge create/delete +
assignment editing: super-admin or `manage_events`-class (TBD: gate to super-admin
+ assigned admins). Bulk-apply a given badge: super-admin OR the badge's org is in
the viewer's assignments (server re-checks, never trusts client).

## Testing
- canApplyOrgBadge(viewer, badge) authorization (super vs assigned vs not).
- org badge id round-trip (`org:<id>` ↔ org_badges).
- computeBadges surfaces an `org:` override when extraCatalog provided; drops it
  otherwise (back-compat).

## Out of scope (v1)
- Points on badges / rescore.
- Per-badge color/icon customization (gold default).
- Bulk-apply of auto-computed catalog badges.
