# Branch: `hotfix-leaderboard-client-db-import` — progress log

## Progress Update as of 2026-05-31 9:23 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
**Prod hotfix.** After #143 (faceted leaderboard) merged, `/leaderboard` white-
screened with `Error: No database connection string was provided to neon()` in
the **browser** console. Root cause: the `"use client"` component
`LeaderboardFilters.tsx` did a **runtime value import** (`STAGE_VALUES`,
`OUTCOME_VALUES`) from `@/lib/leaderboard`, whose first line is
`import { db } from "@/db"` → `neon(process.env.DATABASE_URL!)`. The value import
dragged `@/db` into the client bundle, where `DATABASE_URL` is undefined, so
`neon()` threw at module evaluation. (The pre-existing client components only
`import type` from that module, which is erased — that's why the old leaderboard
worked.)

### Detail of changes made:
- New DB-free module `src/lib/leaderboard-constants.ts` holding the facet
  constants (`STAGE_VALUES`, `OUTCOME_VALUES`) and filter types
  (`LeaderboardTab`/`StageValue`/`OutcomeValue`/`LeaderboardRole`/
  `LeaderboardCursor`/`LeaderboardFilter`). It imports nothing DB-related.
- `src/lib/leaderboard.ts` now imports + re-exports those from the new module, so
  every existing server-side consumer of `@/lib/leaderboard` is unchanged.
- `LeaderboardFilters.tsx` imports the constants from `@/lib/leaderboard-constants`.
- Regression test `tests/lib/leaderboard-client-no-db.test.ts`: (1) the constants
  module imports with no `DATABASE_URL`; (2) no `Leaderboard*` client component
  value-imports from `@/lib/leaderboard`.

### Potential concerns to address:
- General rule: any `"use client"` file must import leaderboard runtime values
  from `@/lib/leaderboard-constants`, never `@/lib/leaderboard` (which is DB-bound).
- This class of bug isn't caught by `tsc`/`next build` (it's a client-runtime
  failure); the new source-scan test is the guard.
