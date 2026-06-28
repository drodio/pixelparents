# Branch: `ai-sdk-rescore-fix` — progress log

Branched from `main` (post score-items-interactive-ui merge via PR #20).
Fixes the re-score path that was crashing every call with "response did
not match schema," and ships the schema-drift guard the leaderboard
outage post-mortem flagged as missing.

## Progress Update as of 2026-05-23 3:58 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged latest `main` (PR #20's Phase 2 interactive ScoreTable) into
this branch. One trivial textual conflict in `eval-pipeline.ts` —
both branches added different comments near the same line. Kept both.

## Progress Update as of 2026-05-23 3:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Re-score was 100% broken in prod (and dev) since the Phase 1 scoring
schema picked up new fields. Vercel AI Gateway's structured-output
translation was double-wrapping Claude's tool-call response — the
returned object had the JSON-Schema reference URL as a top-level key
with the actual response as its value, so Zod saw a string-of-a-string
and rejected every eval. Switched the scoring call from
`generateObject()` to `generateText()` + manual JSON parse, which
sidesteps the gateway's tool-call translation entirely.

Also lands the schema-drift guard the leaderboard outage post-mortem
called for: when `src/db/schema.ts` is staged, the husky pre-commit
hook runs `pnpm drizzle-kit generate` and blocks the commit if a new
migration file gets created (i.e. schema and migrations are out of
sync). And captures the previously-undocumented
`users.clerk_image_url` + `pref_text_alerts` default change as a real
migration file (`drizzle/0002_bumpy_screwball.sql`) — the column was
ad-hoc ALTERed onto prod earlier but never had a migration, which is
what caused the original leaderboard 500.

### Detail of changes made:
- `src/lib/eval-pipeline.ts`:
  - `generateObject` → `generateText`. Schema validation happens in
    code via `SCORING_SCHEMA.safeParse()` after extracting the JSON
    object from the model's text response.
  - New helper `extractJsonObject()` strips markdown fences and finds
    the first balanced `{...}` so partial markdown wrapping doesn't
    break parsing.
  - New constant `SCHEMA_HINT` — a TypeScript-shape representation of
    `SCORING_SCHEMA` appended to the prompt so Claude knows exactly
    what fields to emit. Keep in sync when changing `SCORING_SCHEMA`.
- `src/lib/scoring.ts`:
  - `.catch(50)` on every `confidence` field + `summaryConfidence`.
    Single-row validation errors (out-of-range float, missing field,
    wrong type) now fall back to 50% instead of nuking the whole eval.
    Defense-in-depth alongside the generateText switch above.
- `tests/lib/eval-pipeline.test.ts`:
  - Mock updated from `generateObject` → `generateText` with stringified
    JSON. Includes `extractedMetrics` + `confidence` fields so the mock
    response passes the new schema.
- `.husky/pre-commit`:
  - New "schema drift guard" block. Fires only when `src/db/schema.ts`
    is staged. Runs `pnpm drizzle-kit generate` — if output doesn't
    contain "No schema changes," the commit is blocked and the user
    is told to stage the freshly-generated migration file.
- `drizzle/0002_bumpy_screwball.sql` + `drizzle/meta/0002_snapshot.json`:
  - Captures `users.clerk_image_url` (text) and
    `users.pref_text_alerts` default → `true`. Both already exist on
    prod from earlier ad-hoc ALTERs; this file just brings the
    migration history in sync. Uses `ADD COLUMN IF NOT EXISTS` so
    re-running is safe.

### Verified on dev branch (ep-old-shadow):
- Single re-score: HTTP 200 in 32s. 11 score_items rows with real
  AI-emitted confidence values (70-95% range, not the default 50).
- All 88 tests pass.

### Operator follow-up after merge:
- Re-run the bulk backfill on prod (15-17 evals). Once this PR
  deploys, the script in scripts/ (or just `for id in ...; curl
  /api/rescore`) will succeed instead of 503-ing.

### Potential concerns to address:
- `SCHEMA_HINT` is a string duplicate of `SCORING_SCHEMA`. If we add
  new fields to one and forget the other, Claude either won't emit
  the new field (extra field in schema) or will emit a field that's
  ignored (extra field in hint). Future cleanup: generate the hint
  from the Zod schema via `zodToTs` or similar.
- The `nfx-signal-enricher` branch has uncommitted enricher work
  (`src/lib/apify.ts`, `src/lib/enrichers/nfx.ts`, and a `types.ts`
  edit adding "nfx" to the source enum). Those changes live in the
  working tree only — they didn't come along on this commit.
