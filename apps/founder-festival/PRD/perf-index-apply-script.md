# Perf-index apply script — perf-index-apply-script

## Progress Update as of 2026-06-10 04:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added `scripts/apply-performance-indexes.ts` to apply the audit performance
indexes (`scripts/sql/performance-indexes.sql`) idempotently via neon-http,
mirroring the apply-*-migration.ts pattern. Verified neon-http runs CREATE INDEX
CONCURRENTLY in autocommit (no txn-block error). Applied to dev (ep-old-shadow).

### Detail of changes made:
- 8 statements, each `CONCURRENTLY IF NOT EXISTS` (keyset ×3, find-email queue,
  pg_trgm + full_name GIN, canonical_industries GIN, scored_pop covering index).
- Prints target host before writing; per-statement ok/fail logging.

### Potential concerns to address:
- PROD apply still pending (a prod DB action): `DOTENV_CONFIG_PATH=<abs path to
  .env.prod.local> npx tsx --require dotenv/config scripts/apply-performance-indexes.ts`
