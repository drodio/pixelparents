# Branch: `admin-cost-multiplier` — progress log

Branched from `main` on 2026-05-26. Phase 1 of the admin-credits feature
(cost multiplier + display). Phases 2 (admin credits buy) and 3 (enforcement)
are separate, later branches.

## Progress Update as of 2026-05-26 7:26 PM Pacific
*(Most recent updates at top)*

### Summary
RBAC refinements (Phase A): a no-role admin now has **no** access (was full); an
**Edit Role** control lets you reassign an approved admin's role in-place; role
checkboxes are visually grouped into **Users / Events / Admin** categories.

### Detail of changes made:
- `grants.ts`: no-role branch in `getViewerGrants` now returns `[]` (was all
  grants). Added `GrantCategory = "users" | "events" | "admin"` and a `category`
  on every `GRANTS` entry. Catalog is now 9 keys (added `view_profiles`,
  `manage_pending` earlier). Categories: users = run_scoring_jobs / view_profiles
  / manage_pending; events = create/manage/delete_events; admin (super-admin
  territory) = approve_admin_requests / create_roles / edit_roles.
- `RolesManager`: new `GrantCheckboxes` component renders the catalog grouped by
  category (used in both create + edit forms).
- **Edit Role**: `setAdminAccessRole(id, roleId)` in `admin-access.ts`; new
  `PATCH /api/admin/access/[id]` (gated `approve_admin_requests`, clears role on
  invalid/missing roleId). `AdminAccessTable` approved rows get an Edit Role →
  inline role `<select>` + Save/Cancel, keyed on the row id (no clerkUserId
  needed). The "no role" labels now read "no access" (no longer "full access").
- `cost-multiplier.ts`: hardened `clampCostMultiplier` to treat `null` as a
  non-number (was returning 1 via `Number(null) === 0`) → default 10.
- Tests: `grants.test.ts` updated (9-key catalog, every-grant-has-category,
  no-role → `[]`). `cost-multiplier.test.ts` green.

### Verification:
- `tsc` clean, eslint clean on changed files, grants + cost-multiplier tests
  pass. (3 unrelated DB-integration tests flake on the shared Neon DB — fail on
  baseline too.) No new DB columns; no migration needed for Phase A.

### Next (Phase B, later):
- Users/Events "All vs Only Theirs" scope sliders + ownership enforcement
  (events by created_by_email; profiles by the creating job's created_by_email).

## Progress Update as of 2026-05-26 6:55 PM Pacific
*(Most recent updates at top)*

### Summary
Each RBAC role has a **cost multiplier** (default 10, min 1). Every cost figure
shown in the admin is multiplied by the viewer's multiplier; super-admins /
env-admins / no-role admins see ×1 (real).

### Detail of changes made:
- Migration `0016`: `admin_roles += cost_multiplier integer NOT NULL DEFAULT 10`.
  Applied to DEV; **PROD needs 0016 when shipped.**
- `lib/cost-multiplier.ts` (+test, TDD): `clampCostMultiplier`, `applyCostMultiplier`,
  `effectiveCostMultiplier({ privileged, roleMultiplier })`.
- `grants.ts`: `getViewerCostMultiplier()` — super/env → 1, role → its multiplier.
- `admin-roles.ts`: `getRoleForClerkUser` returns `costMultiplier`; create/update
  accept + clamp it.
- `/api/admin/roles` (POST + PATCH): accept `costMultiplier`.
- `RolesManager`: "Cost multiplier" number input (create + edit) + "×N cost" chip.
- Display ×mult applied to: `/admin/score` (Vercel/Exa/total + per-job est/actual),
  `/admin/score/new` (Sonnet/Opus per-eval + estimate via the props; stale preview
  multiplied in the API dryRun), `JobProgress` (job est/actual + LLM/Exa + per-item
  cost), `/admin/spend` (all), `/admin/profiles` ("Cost" only — **Charge stays real**,
  it's external billed revenue). The Vercel account lifetime balance also stays real.

### Verification:
- TDD: `cost-multiplier.test.ts`. tsc + eslint clean; admin surfaces compile (200).
  Display-only — stored/charged cents are untouched (Phases 2/3 handle money).

### Next phases (separate):
- Phase 2: "Credits" admin nav section (default-on) + buy packs (reuse developer
  credits/Stripe). Phase 3: enforce credit debits at multiplier × real cost.
