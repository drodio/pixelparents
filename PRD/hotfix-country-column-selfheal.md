# Pixel Parents — Progress Log (branch: `hotfix/country-column-selfheal`)
*(Most recent updates at top)*

## Progress Update as of June 29, 2026 — 8:40 PM Pacific

### Summary of changes since last update
P0 hotfix: PR #87 added `country` to the Drizzle `signups` schema, so every
`db.select().from(signups)` (SELECT *) now requests a `country` column that the
prod DB doesn't have yet — and the read paths (directory/dashboard/community/
account/p) never triggered the self-heal (only the signup WRITE path did). Result:
those pages threw on prod. Fix: call `ensureFamiliesSchema()` (which idempotently
ADD COLUMN IF NOT EXISTS country) at the top of the signups read helpers.

### Detail of changes made:
- **lib/db/signups.ts** — `await ensureFamiliesSchema()` at the start of
  `getSignupByEmail`, `getSignupForEdit`, and `getSharedProfileByToken` (the three
  SELECT * entry points used by every family-facing page). Memoized, so it's a
  no-op after the first call per cold start. The bulk directory select runs after
  the viewer gate (getSignupByEmail), so the column exists by then.

### Potential concerns to address:
- Root lesson: adding a column to the Drizzle schema breaks SELECT * reads on prod
  until the column exists. Any future column must either (a) be in a self-heal that
  the read paths call, or (b) be migrated first. Consider a single shared read
  wrapper that always self-heals.
- Admin pages that select signups directly will also self-heal once any family page
  loads (the ALTER persists in the DB).
