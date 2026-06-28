# Branch: `fix-test-db-leak` — progress log

Branched from `main` (post `admin-hide-delete-profile` merge, commit `0d2aa6e`).

## Progress Update as of 2026-05-28 7:50 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two test files (`tests/app/rescore-all.test.ts` and
`tests/app/retry-failed.test.ts`) were writing real `scoring_jobs` rows
into whatever DB `DATABASE_URL` pointed at — which, on a fresh
`vercel env pull`, is the production Neon branch. The rescore-all test
also had its cleanup in the happy path, so when an assertion threw
mid-test the orphaned job stayed in the DB forever and surfaced on
`/admin/profiles`. 13 such orphans were live in prod earlier today;
deleted out-of-band.

The repo already has the right scaffolding: `tests/setup.ts` exports
`IS_PROD_DB`, and other DB-writing tests guard with
`describe.skipIf(IS_PROD_DB)(...)`. These two files just weren't using
it.

### Detail of changes made:
- `tests/app/rescore-all.test.ts`:
  - Imported `IS_PROD_DB` from `../setup`; wrapped the suite with
    `describe.skipIf(IS_PROD_DB)`.
  - Added a module-level `const jobIds: string[] = []` tracker.
  - Added `afterEach` that drains `jobIds` and deletes them in one
    `inArray` query (FK cascade handles items). The drain pattern
    means the cleanup runs even when an assertion throws mid-test.
  - Moved the previous inline cleanup at the end of the happy-path
    test into the tracker (`jobIds.push(json.jobId)` after the
    successful POST).
- `tests/app/retry-failed.test.ts`:
  - Imported `IS_PROD_DB`; wrapped the suite with
    `describe.skipIf(IS_PROD_DB)`. Its existing `afterEach` cleanup
    is already idempotent so no other change needed.
- Confirmed via `pnpm test`: 61 passed, 4 skipped, 0 failed.
  Confirmed via DB audit: zero new `admin@test.dev` rows created
  during the test run.

### Why not a hard abort in setup.ts:
- The user asked for a "guard that aborts" but the existing convention
  in this repo is *skip-with-warn*, and pure-function tests in
  `tests/lib/` and `tests/api/redeem.test.ts` etc. depend on the
  setup loading without aborting. A hard abort would break the
  pure-function suites and CI for everyone using a default
  `.env.local`. The actual gap was that two test files didn't opt
  into the existing guard. Fixed by opting them in. If a new
  DB-writing test is added later without the guard, the warning at
  `tests/setup.ts:23-28` already prints loudly at suite start.

### Potential concerns to address:
- No mechanism today *forces* a new DB-writing test to use
  `skipIf(IS_PROD_DB)`. A reviewer has to remember. Could add a
  lint rule or a setup-file invariant later if the leak recurs.
- Tests still skip silently when `IS_PROD_DB` is true. For local
  iteration, that means the rescore-all/retry-failed coverage is
  effectively dark unless a Neon test branch is provisioned and
  `TEST_DATABASE_URL` is set. Worth doing properly when there's
  time.
