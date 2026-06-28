## Progress Update as of 2026-05-28 06:41 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged latest `origin/main` to pick up PR #109 (profile-location: city/region/country on users). Resolved migration numbering collision by renumbering this branch's migration to 0024.

### Detail of changes made:
- Migration file renamed: `0023_glorious_ink.sql` → `0024_flippant_stark_industries.sql` (content unchanged, just resequenced after main's 0023_glorious_romulus.sql). schema.ts and profile/page.tsx auto-merged cleanly.
- Type check clean post-merge. The 10 new admin-profile tests still pass.

## Progress Update as of 2026-05-28 06:22 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Adds superadmin-only "Hide" and "Delete" buttons to the profile page so a superadmin can pull a low-quality profile from the leaderboard (reversibly) or remove it entirely without touching the DB. Also extracts the long-existing delete cascade into a reusable helper so the user-initiated and admin-initiated delete paths can't drift.

### Detail of changes made:
- **Schema** (`src/db/schema.ts`): adds `evaluations.hidden_at` (`timestamp with timezone`, NULL = visible) and `evaluations.hidden_by_clerk_user_id` (audit). New index `evaluations_hidden_at_idx`.
- **Migration** `drizzle/0023_glorious_ink.sql`: just the two `ALTER TABLE ADD COLUMN` and the new index. Already applied to the shared dev/prod Neon DB via a one-off script (deleted after use).
- **Leaderboard filter** (`src/lib/leaderboard.ts`): `baseWhere` now includes `isNull(evaluations.hiddenAt)`. Hidden profiles still resolve at their canonical URL — only the leaderboard query filters them out.
- **Shared cascade helper** (`src/lib/profile-delete-cascade.ts`): single source of truth for "delete one evaluation and all its dependents." Handles `badgeOverrides`, `scoreItems`, `recommendationResponses`, `recommendationVisibility`, `scoringJobItems`, `profileSlugAliases`, and claim rows in `users`. NOTE: this is the updated cascade — adds `recommendationVisibility` (from PR #107) and `profileSlugAliases` (from PR #103) which the original user-delete handler did not yet cover.
- **Existing /api/account/delete refactor**: replaces its inline cascade block with `deleteEvaluationsCascade(evalIdsToDelete)`. Same external behavior; just shared code.
- **New `/api/admin/profile/[evalId]/hide`**: superadmin-gated POST. Body `{ hidden: boolean }` makes the toggle idempotent across concurrent clicks. Sets/clears `hidden_at` + `hidden_by_clerk_user_id`. Errors land in PostHog + admin email via `reportServerError`.
- **New `/api/admin/profile/[evalId]/delete`**: superadmin-gated POST. Cascades the eval + dependents via the helper. **Does NOT delete the Clerk user** (more conservative than user-initiated delete — auth identity stays intact).
- **UI** `src/components/AdminProfileActions.tsx`: client component with Hide / Show pill (optimistic toggle) and Delete pill that opens a confirmation modal. After successful delete, `router.push("/leaderboard")`. Network/API errors revert optimistic state and surface the message inline.
- **Profile page wire** (`src/app/(authed)/profile/page.tsx`): renders `<AdminProfileActions>` immediately below the existing Leaderboard / Re-Score row, gated on the existing `superAdmin` boolean.
- **Tests** (`tests/app/admin-profile-hide-delete.test.ts`): 10 tests covering 401/403 gating, 400 on missing body, 404 on unknown eval id, hide toggle round-trip writes/clears `hidden_at` + `hidden_by_clerk_user_id`, delete cascades evaluation + claim rows. All pass.
- **Full suite**: 426/435 pass. Same pre-existing 2 flaky tests as on the prior PR (`rescore-all` + `profiles-scored` race on shared DB state in parallel mode); both pass individually. Not introduced by this work.
- **Spec doc** at `docs/superpowers/specs/2026-05-28-admin-hide-delete-design.md`.

### Potential concerns to address:
- **Cascade list as single source of truth** — if a future PR adds a new table FKing to `evaluations.id` without updating `deleteEvaluationsCascade`, the delete will fail with a foreign-key violation. Helper is the spot to update; documented in its header comment.
- **Admin-delete does NOT remove the Clerk user.** Intentional (conservative). If we want symmetric behavior with user-delete later, add a flag to the helper + endpoint.
- **Reversibility** — hide is reversible by toggling. Delete is permanent by design.
- **Pre-existing parallel-execution test flakes** — out of scope for this PR but worth a follow-up to add isolation between rescore-all and profiles-scored.
