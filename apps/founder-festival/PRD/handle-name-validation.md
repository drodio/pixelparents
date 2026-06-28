## Progress Update as of 2026-06-01 08:25 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the root cause of wrong-person LinkedIn handles: resolveLinkedinUrl picked
Exa's top search result with NO name validation. Now it picks the first candidate
whose parsed display name matches the searched person (rejects e.g. "Jordan L" for
"Alex Kim"). Validated on real data: 0/8 over-rejections; stylized handles kept.

### Detail of changes made:
- New src/lib/name-match.ts: nameMatches() — diacritic/nickname/order/prefix tolerant;
  rejects ONLY when neither first nor last name token matches. 17 unit tests.
- find-linkedin-handle.ts: resolveLinkedinUrl now pulls 5 candidates (free — same Exa
  search) and picks the first NAME-MATCHING one; null if none (no wrong handle).
- scripts/backfill-handles.ts: report-only re-validation (npx tsx ... sample|scan).

### Potential concerns to address:
- Mismatch rate is LOW (~1%, not the 3-10% my handle-heuristic suggested — stylized
  handles like jl0rd4n/al3xkm/sr1vera are correct but don't token-match).
- Backfill is REPORT-ONLY: a wrong handle means the score was computed against the wrong
  person, so the fix is a RE-SCORE, not a URL swap. Blind re-resolve churns valid handles.
- Only resolveLinkedinUrl (scoring-tick path) is gated; /api/find-handle and /api/v1/resolve
  still return all candidates for humans to choose.
