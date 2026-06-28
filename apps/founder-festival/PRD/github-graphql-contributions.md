## Progress Update as of 2026-06-06 12:55 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First of the overnight data-source expansions: GitHub **GraphQL contribution
graph**. The single highest-value, identity-SAFE technical signal — it reuses the
already-confidence-gated GitHub login (no new same-name match surface) and surfaces
what REST cannot: trailing-12-month commit/PR/review totals and the **private
contribution count** (the fix for a dormant-looking public profile whose owner
ships daily in private repos).

### Detail of changes made:
- `src/lib/enrichers/github.ts` — added `ghGraphQL()` helper (POST api.github.com/
  graphql; no-ops without `GITHUB_TOKEN`), `fetchGithubContributions(login)` (pulls
  contributionsCollection + gists + sponsors + repositoriesContributedTo), and pure
  `githubContributionFacts()`. Wired into `enrichWithGithub` AFTER the confident
  match, so no new identity risk.
- `src/lib/scoring.ts` — "GITHUB CONTRIBUTION-GRAPH SUB-RULES" block: volume tier
  (250+/1k+/3k+ → +5/+10/+18), private-contribution bonus (+3/+6, overrides Dormant
  penalty), external-repo collaborator (+1 per 5, cap +8), gists (+2), Sponsors
  (+5/+8). All Technical Depth.
- `tests/lib/github-contributions.test.ts` — 6 tests (pure rendering + mocked
  GraphQL parse + no-token no-op + error no-op).
- Doc → changelog entry (no version bump; additive enricher).

### Potential concerns to address:
- Requires `GITHUB_TOKEN` (present in Vercel Prod/Preview). Local dev without it
  simply skips these facts — verified graceful no-op.
- Rescore-to-apply (new facts only reach the score on re-score).
- Could not live-test against the real GraphQL API locally (prod-secret pull is
  classifier-blocked); validated via mocked unit tests + the known-stable GitHub
  GraphQL schema. Low risk: fail-safe to no-op on any error.
