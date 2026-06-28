# Branch: `phase-b-rbac-scope` — progress log

Phase B of the admin-credits/RBAC epic: per-category record scope ("All" vs
"Only Theirs") for the Users and Events grant categories, with enforcement.
Branched from `main` after PR #90 (cost multiplier + Phase A) merged.

## Progress Update as of 2026-05-26 10:20 PM Pacific
*(Most recent updates at top)*

### Summary
Merged `origin/main` in to resolve conflicts after PR #94 (events-v1 / profiles
run consolidation) landed. #94 refactored `listScoredProfiles` (→ `EVAL_BASE_COLUMNS`
+ `enrichEvals`) and the profiles page (→ `ProfilesScoredTable`) — both files my
scope work touches.

### Detail:
- `profiles-scored.ts`: kept main's superset imports + `enrichEvals` refactor;
  re-applied my `ownerEmail` param + `ownedIds` filter on top (the `.where` now
  uses `EVAL_BASE_COLUMNS` AND the owner filter).
- `/admin/profiles/page.tsx`: kept main's `ProfilesScoredTable`/`rows` rendering;
  my scope (`getViewerScopes`/`ownerEmail` → `listScoredProfiles(200, ownerEmail)`)
  survived; respected main's removal of the descriptive paragraph by showing a
  one-line "only profiles from bulk jobs you created" note **only when scoped**.
- NEW from #94: `/admin/profiles/[jobId]/page.tsx` (single-run view) — added a
  `canAccessJob(jobId)` guard so a "theirs"-scoped role can't open another admin's
  run via that URL (consistency with the rest of Phase B's enforcement).
- Verified post-merge: tsc clean, eslint clean, 297 lib unit tests pass.

### Summary
RBAC roles now carry a per-category scope: **Users** (scoring jobs + scored
profiles) and **Events** each get an `[All | Only Theirs]` toggle. "Theirs" =
records the admin created (matched by `created_by_email`). Super-admins /
env-admins / role-less admins always see everything. Enforced on list views,
detail pages, and mutation routes.

### Detail of changes made:
- **Schema**: `admin_roles += users_scope, events_scope text NOT NULL DEFAULT 'all'`
  (migration `0017_omniscient_bloodstrike.sql`). The legacy `scope` column is now
  unused/superseded. **Applied to DEV; PROD needs 0017 before merge.**
- **`src/lib/role-scope.ts`** (TDD): `RoleScope = "all"|"theirs"`, `clampScope`,
  `effectiveScope({privileged, roleScope})`.
- **`src/lib/grants.ts`**: `getViewerScopes()` → `{users, events}` (super/env/no-role
  → all/all; role → its scopes); `getViewerEmail()` (lowercased primary email,
  the value compared against `created_by_email`). Unit-tested.
- **`src/lib/ownership.ts`**: `canAccessEvent(id)`, `canAccessJob(id)` (all-scope
  → true; theirs → row's created_by_email must match viewer; null viewer email or
  unknown id → false/fail-closed); `viewerIsUsersScoped()`, `viewerIsEventsScoped()`.
- **`admin-roles.ts`**: `getRoleForClerkUser` returns `usersScope`/`eventsScope`;
  `createRole`/`updateRole` accept + clamp them.
- **`RolesManager`**: per-category `ScopeToggle` ([All | Only Theirs]) in create +
  edit (Users + Events only; Admin category = no scope). "only theirs" badges in
  the collapsed role header. Roles API routes + roles page serialize the scopes.
- **Enforcement**:
  - Profiles: `listScoredProfiles(limit, ownerEmail)` — when scoped, only profiles
    from bulk jobs the viewer created (web/API profiles have no creating job →
    excluded). `/admin/profiles` passes ownerEmail when Users=theirs.
  - Events: `/admin/events` list filtered (case-insensitive `lower()` compare,
    since old rows weren't lowercased); event detail page + both applicant
    mutation routes (`[applicantId]` PATCH, `bulk` POST) guarded by `canAccessEvent`.
    Event create now lowercases `created_by_email`.
  - Jobs: `/admin/score` list filtered to own jobs; Spend dashboard + "Re-score
    all" hidden when Users=theirs; job detail page + `/api/admin/jobs/[id]`
    (GET + re-run POST) guarded by `canAccessJob`; `/api/admin/rescore-all`
    rejects theirs-scoped (cross-tenant op).

### Verification:
- `tsc` clean; eslint clean (also fixed a pre-existing `<a>`→`<Link>` on the events
  page); unit tests pass (role-scope 5, grants 11 incl. new getViewerScopes cases).
  Integration tests pass in isolation; the 2 full-suite failures (rescore-all,
  profiles-scored) are pre-existing shared-Neon cross-test contention (pass alone).

### Decisions / scoped-out (for review):
- "Theirs" for Users covers jobs + scored profiles only. **Pending items**
  (`manage_pending`, event applicants) are NOT per-record scoped — left all-or-
  nothing by grant, since "records they uploaded" doesn't map cleanly to the
  pending queue. Revisit if you want pending scoped too.
- Web/API-sourced profiles never appear for a theirs-scoped viewer (they weren't
  "uploaded" by that admin). Intentional.
- Enforcement fails **closed**: a theirs-scoped viewer with no resolvable email
  matches no records.

### Ship notes (HELD — not merged):
1. Apply **0017** to prod first (see command in the PR / ask Claude).
2. Then merge. No money/credits involved — safe RBAC change.

### Potential concerns:
- The legacy `admin_roles.scope` column is now dead weight (kept to avoid a
  destructive prod migration). Drop later if desired.
