## Progress Update as of 2026-05-28 10:04 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Adds the HN Tokenmaxxing leaderboard (https://tkmx.odio.dev) as a new Tier-1 enricher. Strong current-technical-depth signal — being listed on this curated/opt-in board means the subject is shipping with code-gen tools TODAY, distinct from historical GitHub presence (the gap drodio called out about his own 95/100 Technical Depth score being driven by "GitHub 14 years ago").

### Detail of changes made:
- `src/lib/enrichers/hn-tokenmaxxing.ts`: new enricher. Fetches `/api/users` + `/api/usage?days=28` from tkmx.odio.dev. Matches the subject by HN handle against either `user.username` or `user.hn_username` (case-insensitive, exact equality — partial would create false positives). Aggregates the usage rows per username to compute a 28-day rank.
- `src/lib/enrichers/types.ts`: adds `"hn-tokenmaxxing"` to the `EnrichmentResult.source` union.
- `src/lib/enrichers/index.ts`: wires the new enricher into `runEnrichments`. Runs in parallel with the others via `Promise.allSettled`, so a fetch failure can't sink the pipeline.
- `src/lib/scoring.ts`: adds an `HN TOKENMAXXING SUB-RULES` block to `SCORING_RUBRIC`. Listed → +10 once; rank tiers Top 25 / Top 10 / Top 5 → +10 / +20 / +35.
- `src/lib/credibility-vectors.ts`: routes hn-tokenmaxxing facts and citations to the **Technical Depth** vector (both via the `tkmx.odio.dev` source-URL pattern and via the `tokenmaxx|tkmx` reason-text pattern).
- `PRD/scoring-rubric-v0.0.1.md`: adds the row to the data-sources table and a sub-rules section.
- `tests/lib/hn-tokenmaxxing-enricher.test.ts`: 6 tests — no HN URL → empty, not on board → empty, hn_username match when usernames differ, rank computation, listed-with-no-usage, fetch failure.

### Potential concerns to address:
- **Identity match strength**: only fires when the subject has a pre-confirmed HN URL in their highlights. False positives are unlikely given exact-equality matching, but a HN handle that happens to match another person's tkmx username is a (very unlikely) failure mode. Trade-off: looser matching → more recall but more false positives. Sticking with exact for now.
- **Leaderboard population is ~50 today.** Score tiers (Top 25/10/5) are calibrated to that size. If the board grows substantially, the tiers should be re-tuned.
- **No caching layer.** Every score-run makes two HTTP calls to tkmx.odio.dev. At current eval volume that's fine. If we run bulk-rescore against thousands of profiles, add a Vercel KV / in-memory module-level cache with a short TTL (the leaderboard updates ~daily).
