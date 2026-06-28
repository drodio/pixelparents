
## Progress Update as of 2026-06-05 09:20 PM Pacific

### Industry data layer built (blocked on prod migration for deploy)
- `db/schema.ts`: `canonical_industries text[]` column + migration
  `drizzle/0036_freezing_red_shift.sql` (`ALTER TABLE evaluations ADD COLUMN ...`).
- `scoring.ts`: new `industries: string[]` scorer field (founder company sectors +
  investor focus; tolerant .catch([])). Prompt instruction added.
- `eval-pipeline.ts`: `canonical_industries` = canonicalizeIndustries(investor focus
  ∪ scorer industries) in payloadToWriteFields (both branches).
- `leaderboard.ts` + `leaderboard-constants.ts`: `industry=<slug>` (CSV) filter
  param + `arrayOverlaps(canonical_industries, …)` predicate — the contract the
  leaderboard agent consumes for click-to-filter + Option B sidebar counts.
- `industries.ts` taxonomy (cherry-picked) is in this branch.
- tsc clean; 18 industry/filter tests pass. Migration applied + validated on DEV
  (360 rows, 0 backfilled — dev has no investor-industry data).

### BLOCKED: prod migration must be applied before merge
The classifier blocked auto-applying the prod migration (DROdio wanted to be told
it first). Deploying before the column exists would break ALL scoring
(payloadToWriteFields writes the column). So the PR is ready but NOT merged.
**The one manual step:** apply migration 0036 to prod, then merge the PR:
  DOTENV_CONFIG_PATH=.env.local npx tsx --require dotenv/config scripts/apply-canonical-industries.ts prod
(idempotent ADD COLUMN IF NOT EXISTS + a light backfill of existing investor rows;
founders populate on rescore via the new `industries` field.)
