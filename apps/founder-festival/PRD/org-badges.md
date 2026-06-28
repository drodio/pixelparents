## Progress Update as of 2026-06-09 05:22 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged latest `main` into the branch and resolved conflicts. Main had shipped a
`changelog_entries` / `changelog_subscribers` schema addition and its own
migrations `0044`/`0045`, colliding with my `0044`. Resolved by keeping all four
new tables in `schema.ts`, taking main's drizzle journal/snapshots, deleting my
mis-numbered `0044_amazing_ben_grimm`, and regenerating my migration as
`0046_slippery_vector.sql` (org_badges + admin_org_assignments only). Prod/dev
already have these tables from the idempotent apply script; the migration file
just keeps drizzle history consistent. Re-verified: tsc + build + org-badges
tests all green post-merge.

### Detail of changes made:
- `drizzle/0044_amazing_ben_grimm.sql` deleted → `drizzle/0046_slippery_vector.sql`.
- `schema.ts` end-of-file now has changelog tables (main) followed by org tables.

---

## Progress Update as of 2026-06-09 05:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Made the prod migration runnable with a single command. The prod env file
(`.env.prod.local`) leaves `DATABASE_URL_UNPOOLED` empty but populates
`POSTGRES_URL_NON_POOLING`, and that var isn't exported into an interactive
shell — so the old `APPLY_DB_URL="$POSTGRES_URL_NON_POOLING" …` form expanded to
empty. Fixed `scripts/apply-org-badges-migration.ts` to also fall back to
`POSTGRES_URL_NON_POOLING`, so loading the prod env file via dotenv is enough.

### Detail of changes made:
- Prod apply command is now:
  `DOTENV_CONFIG_PATH=.env.prod.local npx tsx --require dotenv/config scripts/apply-org-badges-migration.ts`
  The script prints the target host before writing — confirm it's the prod Neon
  endpoint (dev = ep-old-shadow…).

---

## Progress Update as of 2026-06-09 04:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Built the full **org-badges** feature: hosts/sponsors can define custom badges
(e.g. "District Member"), admins are associated with hosts/sponsors on a new
admin-detail page, and authorized badges can be bulk-applied to scored profiles.
Schema, lib, API routes, editors, the admin detail page, and the bulk-apply UI
are all in. Typecheck + lint + tests + `pnpm build` all pass. **Prod DB
migration is NOT yet applied — must run before deploy.**

### Detail of changes made:
- **Schema (`src/db/schema.ts`)** — two additive tables: `org_badges`
  (`owner_type` host|sponsor, `owner_id`, `label`) and `admin_org_assignments`
  (`clerk_user_id`, `owner_type`, `owner_id`, unique). Migration file
  `drizzle/0044_amazing_ben_grimm.sql`. Apply via the idempotent
  `scripts/apply-org-badges-migration.ts` (CREATE TABLE IF NOT EXISTS) — **dev
  applied, prod pending.**
- **Render (`src/lib/badges.ts`)** — `computeBadges` now recognizes any
  `org:<id>`-prefixed override and surfaces it as a gold "identity" pill using
  the override's `editedLabel`. No caller changes needed — every surface that
  already passes override rows (profile, scored table, leaderboard, dev API)
  renders org badges automatically.
- **Lib (`src/lib/org-badges.ts`)** — `orgBadgeOverrideId`/`parse…`,
  `listOrgBadges`/`createOrgBadge`/`deleteOrgBadge` (delete also clears applied
  overrides), `getAdminAssignments`/`setAdminAssignments` (delete+reinsert),
  `authorizedOrgBadges()` (super → all; else by assignment),
  `canApplyOrgBadge()`, `applyOrgBadgeToProfiles`/`removeOrgBadgeFromProfiles`
  (badge_overrides upsert/delete, status confirmed, editedLabel=label),
  `countAppliedOrgBadge`.
- **Host/sponsor editors** — `OrgBadgeEditor` (add/delete badges) on
  `/admin/hosts/[id]` and `/admin/sponsors/[id]`; `GET/POST/DELETE
  /api/admin/org-badges` (gated `manage_events`).
- **Admin detail page** — "Edit" link on approved rows in `AdminAccessTable`
  → `/admin/access/[id]`: edit name + multiselect host/sponsor association.
  Backed by extended `PATCH /api/admin/access/[id]` (now also handles `name`
  and `assignments` alongside the existing `roleId`); new
  `getAdminAccessById`/`setAdminAccessName` in `admin-access.ts`.
- **Bulk-apply** — section atop `ProfilesScoredTable` ("Apply these badges to
  all N profiles below:") listing the viewer's `authorizedOrgBadges`; clicking
  toggles apply/undo across every row currently in the table (the active
  filter/sort) via `POST /api/admin/badges/bulk` (re-checks `canApplyOrgBadge`
  server-side). Wired into both `/admin/profiles` and `/admin/profiles/[jobId]`.
- **Tests** — `tests/app/org-badges.test.ts`: id round-trip + computeBadges org
  rendering (pure) and create/apply/count/remove/delete + assignment replace
  (db, skip-on-prod). All pass.

### Potential concerns to address:
- **Prod migration gate.** The new code READS `org_badges` /
  `admin_org_assignments`. Deploying before the prod tables exist would 500 the
  host/sponsor/access/profiles admin pages. Run
  `APPLY_DB_URL="$POSTGRES_URL_NON_POOLING" npx tsx scripts/apply-org-badges-migration.ts`
  (or have DROdio run it) BEFORE merging to main.
- **No points / no rescore** (per DROdio) — org badges are display-only pills.
  Revisit if badges should ever carry score weight.
- **Bulk-apply scope = current view.** "All profiles below" means the rows
  currently loaded + filtered in the table, not the entire DB. With infinite
  scroll, only loaded rows are affected. Acceptable for v1; flag if a
  "match-the-whole-result-set" apply is wanted later.
- Bulk-apply applied-state is optimistic/local (not seeded from the DB), so the
  ✓ resets on reload. The server action is idempotent, so re-clicking is safe.
