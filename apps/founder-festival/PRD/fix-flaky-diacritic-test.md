# fix-flaky-diacritic-test

## Progress Update as of 2026-06-22 05:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Stabilized the flaky `search-diacritic` "Derya case" test (bd ff-3qw). Root cause:
the persistent CI test branch accumulates a `score:120` "Derya Yilmaz" row every
run; `searchLeaderboard` orders tied scores by random UUID and caps at LIMIT 100,
so once >100 such rows exist, whether this run's row lands in the top-100 is
random. Fix scopes the query to the unique slug suffix (result set = 1 row) and
deletes the row afterward.

### Detail of changes made:
- `tests/lib/search-diacritic.test.ts`:
  - Query is now `Derya Yılmaz ${slugSuffix}` — the suffix matches only the
    just-inserted row's slug, so the result is independent of how many same-named
    rows the branch has accumulated and of the LIMIT/UUID tiebreak. The Turkish
    "Yılmaz" still must ASCII-fold to match the stored "yilmaz" (AND-ed with
    the suffix), preserving the test's intent.
  - Wrapped in try/finally that deletes the inserted row so the branch stops
    growing run-over-run.
- Verified 5/5 deterministic passes locally (dev branch).

### Potential concerns to address:
- Pre-existing accumulated "Derya Yilmaz" rows remain in the persistent CI test
  branch; harmless now that the test is scoped, but the branch could be pruned
  separately if desired.
