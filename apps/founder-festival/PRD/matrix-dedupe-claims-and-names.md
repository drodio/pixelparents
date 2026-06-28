## Progress Update as of 2026-05-28 07:55 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two dedupe fixes for the Founder Matrix:

1. **One candidate per eval, not one per claim.** The original
   `getMatrixCandidates()` LEFT JOINed evaluations × users. A single eval
   with N high-confidence claim rows (a user who signed in across
   different Clerk instances ends up with one users row per Clerk
   userId) was multiplied into N matrix candidates with different
   `(clerkUsername, clerkImageUrl)` → different profileHrefs → the same
   person appearing up to N times in the matrix UI. Specifically
   reproduced for DROdio (1 eval, 3 claim rows → 3 pills in his row
   on every matrix).
2. **One candidate per fullName.** Separately, the DB sometimes contains
   multiple eval rows for the same person (different LinkedIn URL
   variants get scored separately — the unique constraint is on
   `linkedin_url`, not on the person). Patrick Collison's matrix
   appearance was the test case. We now dedupe candidates by
   case/whitespace-normalized fullName, preferring the row with a
   claimer image and then the highest dominant score.

### Detail of changes made:
- `src/lib/founder-matrix.ts`:
  - Split the candidate-fetch into two queries: one for evals (no JOIN),
    one for claims filtered to `match_confidence in ('high', 'medium')`.
  - New exported `pickBestClaimPerEval(claims)` picks one representative
    claim per eval — prefers having clerkUsername (for the `/profile/<u>`
    URL), then having clerkImageUrl (for the avatar), then any.
  - New exported `dedupeByFullName(candidates)` collapses duplicate
    evals for the same person, preferring image-bearing then
    higher-dominant-score. Candidates with no fullName each stand alone
    (keyed by evalId so they don't accidentally merge).
  - `computeMatrix()` now calls `dedupeByFullName()` before
    scoring/sorting.
- `tests/lib/founder-matrix.test.ts`:
  - 5 new tests for `dedupeByFullName` (collapse, image-preference,
    case/whitespace normalization, no-name stays separate, distinct
    names stay separate).
  - 5 new tests for `pickBestClaimPerEval` (one entry per eval, prefers
    username then image, ignores null evaluationId, distinct evals
    separate).

### Potential concerns to address:
- The fullName dedupe uses a case/whitespace-normalized comparison, so
  two unrelated people sharing a name (e.g., two "John Smith"s) will
  merge in the matrix. Acceptable v1 trade-off given the product's
  scale. A LinkedIn-handle-derived key would be more precise but the
  LinkedIn URL isn't always present in the candidate set.
- Patrick Collison still appears in two columns (e.g., similar AND
  complementary). That's intentional / by-design; the columns convey
  different relationships. Not a dedupe miss.
