## Progress Update as of 2026-06-08 10:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the long-standing red CI: the `Test (Neon test branch)` job was failing with `relation "admin_audit_log" does not exist` because CI never migrated the dedicated test branch — it ran vitest straight against `TEST_DATABASE_URL`, so any table-adding migration (here `0037`) silently drifted the branch until applied by hand. Added a `drizzle-kit push --force` step that reconciles the test branch to `schema.ts` before the suite, so it self-heals on every run.

### Detail of changes made:
- `.github/workflows/ci.yml` (test job):
  - New step **"Sync test-branch schema (drizzle push)"** runs `pnpm exec drizzle-kit push --force` with `DATABASE_URL`/`DATABASE_URL_UNPOOLED` = `TEST_DATABASE_URL`, bringing the branch's schema up to date (creates `admin_audit_log` + any future drift) before tests run.
  - New guard step **"Guard — test DB host is not prod"** fails the job if `TEST_DATABASE_URL` contains the prod host (`ep-fragrant-surf-aqyi9p6w`), mirroring the hard guard in `tests/global-setup.ts`. Uses `grep -q` so the masked URL never prints.
- Root cause: CI has no migrate step; the test branch is persistent and was last schema-synced before `0037`. `push --force` is safe here because the branch is disposable and only ever targets the test secret.

### Potential concerns to address:
- `push --force` can issue data-loss statements. That's acceptable for the disposable test branch, but if a future test ever depends on seeded rows beyond `rate_limit`, the push could clear them — watch for new unrelated failures after this lands.
- The repo's real migration model stays manual `apply-*.ts <dev|prod>` for dev/prod; this push path is CI/test-branch-only and deliberately does NOT touch them.
- If `drizzle-kit push` ever can't resolve a schema diff non-interactively it will fail the step (visible), rather than silently drifting — that's the intended trade.
