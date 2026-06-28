## Progress Update as of 2026-06-09 08:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Removed the visibility gate that hid `signalQuality === "low"` profiles from all profile lists (leaderboard, search, event attendee lists, connections). Low-signal profiles now appear everywhere a profile is listed; only code-redeemed, hidden, and test-fixture rows remain excluded. Statistical baselines (computePercentile, credibility getPopulation, founder-matrix getMatrixCandidates) are untouched.

### Detail of changes made:
- `src/lib/leaderboard.ts` `baseWhereFor()`: removed `opts?: { includeLowSignal?: boolean }` parameter and the conditional `ne(evaluations.signalQuality, "low")` exclusion. Updated doc-comment to reflect new semantics (low-signal now included).
- `src/lib/leaderboard.ts` `getLeaderboardRowsForEvalIds()`: removed `opts?: { includeLowSignal?: boolean }` parameter and the conditional low-signal filter. Now does a simple `inArray(evaluations.id, unique)` without any signal gate.
- `src/lib/leaderboard.ts` `searchLeaderboard()`: replaced `baseWhereFor({ includeLowSignal: true })` with reuse of module-level `baseWhere`. Removed stale comment about search including low-signal specially.
- `src/lib/event-attendees-admin.ts`: changed `getLeaderboardRowsForEvalIds(evalIds, { includeLowSignal: true })` to `getLeaderboardRowsForEvalIds(evalIds)`. Removed stale comment.
- `src/lib/events.ts` `resolveEventAttendeeEvalIds()`: removed `ne(evaluations.signalQuality, "low")` from name-fallback query. Low-signal profiles are now resolved by exact name match.
- `src/lib/profiles-scored.ts` rank subquery: changed `WHERE signal_quality != 'low' AND source != 'code'` to `WHERE source != 'code'` (admin dashboard rank column now includes low-signal in the rank population).
- `tests/app/low-signal-visibility.test.ts`: new regression test with `describe.skipIf(IS_PROD_DB)`. Two tests: (1) `getLeaderboardRowsForEvalIds([lowSignalId])` returns the row (length 1); (2) `resolveEventAttendeeEvalIds` name-fallback resolves a low-signal eval's `fullName` to its id.

### Potential concerns to address:
- The admin profiles dashboard "leaderboard rank" column now ranks low-signal profiles among all non-code profiles (previously they were unranked). Their rank will be at the bottom (score 0), which is expected behavior.
- The `getEventAnalytics` function in `events.ts` still does `matched.filter((m) => m.signalQuality !== "low")` before computing cohort stats — this is intentional (analytics should reflect scored cohort quality) and was NOT touched per task scope.
- Pre-existing test failures in `rescore-all`, `eval-pipeline`, `hn-tokenmaxxing-enricher`, `select-top-profiles`, `profiles-scored`, and `redeem` are unrelated to this change and were failing before this branch.
