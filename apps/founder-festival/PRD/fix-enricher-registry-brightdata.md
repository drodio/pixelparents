## Progress Update as of 2026-06-10 01:08 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the RED "Test (Neon test branch)" CI gate on `main`. The enricher-registry
mismatch (missing `brightdata`) was already fixed upstream by PR #320, but the Test
gate was still red because of a SECOND stale assertion in `tests/lib/admin-nav.test.ts`:
the new `/admin/claimed` nav item (added by `08e8c97`, "Claimed Profiles") is gated
by the `view_profiles` grant but the test still expected only `/admin/profiles` +
`/admin/spend` for that grant. Updated the expected set to include `/admin/claimed`.

### Detail of changes made:
- Root cause investigation: the task pointed at `tests/lib/enricher-registry.test.ts`,
  but that mismatch (`EXPECTED_SOURCES` missing `brightdata`) was already resolved on
  `main` by PR #320 (`9cce152`). The CI run on `main` HEAD still failed on a DIFFERENT
  test: `tests/lib/admin-nav.test.ts > visibleNavItems`.
- `src/lib/admin-nav.ts` (line 23) adds `{ href: "/admin/claimed", ... anyGrant: ["view_profiles"] }`.
  Because Claimed Profiles shares the `view_profiles` grant with Scored Profiles,
  `visibleNavItems(["view_profiles"])` now returns 3 hrefs, not 2.
- Fix: updated the assertion in `tests/lib/admin-nav.test.ts` (the `view_profiles`
  case) from `["/admin/profiles", "/admin/spend"]` to
  `["/admin/claimed", "/admin/profiles", "/admin/spend"]` (sorted, since `.sort()` runs).
  This tracks the real, intentional feature — not a delete-the-assertion workaround.
- Verified locally: `admin-nav.test.ts` + `enricher-registry.test.ts` both green.

### Potential concerns to address:
- Pattern risk: adding a nav item gated by an existing grant silently changes the
  `visibleNavItems(...)` set expected by `admin-nav.test.ts`. Contributors adding
  grant-gated nav items must update this test in the same PR.
- The full CI Test gate also relies on `TEST_DATABASE_URL` + a `drizzle-kit push`
  schema-sync step; DB-dependent suites can't be fully reproduced locally without that
  secret. The two assertions fixed here are DB-free and verified locally.
