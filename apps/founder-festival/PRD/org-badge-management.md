## Progress Update as of 2026-06-12 03:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Initial implementation of the org-badge management expansion: `renameOrgBadge` + `listOrgBadgeHolders` lib functions, PATCH handler on the existing org-badges route, new `/api/admin/org-badges/holders` GET route, and a full redesign of `OrgBadgeEditor` into expandable per-badge management cards with inline rename, debounced profile search, and a holders leaderboard table.

### Detail of changes made:
- **`src/lib/org-badges.ts`**: Added `import type { LeaderboardRow }` from `@/lib/leaderboard`. Added `renameOrgBadge(id, label)` — trims label, updates `orgBadges` catalog row and propagates `editedLabel` + `updatedAt` to all matching `badgeOverrides` rows. Added `listOrgBadgeHolders(orgBadgeId)` — queries `badgeOverrides` for all eval ids with that `org:<id>` badgeId, dynamically imports `getLeaderboardRowsForEvalIds`, sorts result by `combinedScore` desc.
- **`src/app/api/admin/org-badges/route.ts`**: Imported `renameOrgBadge`. Added `PATCH` handler — requires `manage_events` grant + `canApplyOrgBadge` check, returns 400 on empty label, 404 on missing badge, `{ ok: true, badge }` on success.
- **`src/app/api/admin/org-badges/holders/route.ts`** (new): `GET ?id=` route with `runtime="nodejs"`, `manage_events` + `canApplyOrgBadge` gates, returns `{ rows: LeaderboardRow[] }`.
- **`src/components/admin/OrgBadgeEditor.tsx`**: Full redesign as expandable per-badge cards. State: `expandedId` (one open at a time), `editingId`, `editLabel`, `holders: Record<badgeId, LeaderboardRow[] | null>`, `holdersLoading`, `badgeMsg`. Each card has: amber `rounded-md` pill (not rounded-full), Edit/Manage/Delete buttons in header; inline input on Edit (Enter=save, Esc=cancel) → `PATCH /api/admin/org-badges`; collapsible panel with debounced search (generation-token pattern from AttendeeManager, 220ms debounce) → `POST /api/admin/badges/bulk {action:"apply"}`, holders fetched on first expand from `/api/admin/org-badges/holders`, displayed via `<ProfileMiniTable isClaimed rowAction={RemoveButton} />` where Remove calls `POST /api/admin/badges/bulk {action:"remove"}`. Props unchanged (`ownerType`, `ownerId`, `initial`).
- **`tests/app/org-badge-management.test.ts`** (new): `describe.skipIf(IS_PROD_DB)` suite. Test 1: seeds host + badge + evaluation, applies badge, asserts `listOrgBadgeHolders` returns 1 row, renames badge, asserts `renameOrgBadge` returns updated label, queries `badgeOverrides` directly to assert `editedLabel === "New Label"`. Test 2: asserts `renameOrgBadge` returns null for whitespace-only label.

### Potential concerns to address:
- `listOrgBadgeHolders` uses a dynamic `import("@/lib/leaderboard")` to avoid circular-import risk (leaderboard imports from db, org-badges does too — no cycle in practice, but dynamic import is safe). If the leaderboard module grows to import from org-badges, a proper re-export would be needed.
- The Manage panel fetches holders once on first expand and refreshes after apply/remove. If another admin applies/removes concurrently, the list could be stale until the next expand-close-expand cycle; a manual "Refresh" button could be added in the future.
- `ProfileMiniTable` with `isClaimed={true}` always shows full data — appropriate here since this is an admin-only surface.
