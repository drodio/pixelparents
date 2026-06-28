## Progress Update as of 2026-06-10 11:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Part 1 of the keyless data-source batch DROdio approved (autonomous,
ship-to-prod): added `[crates]` (Rust OSS footprint) and `[tranco]` (domain-rank
cross-check) enrichers. Both keyless, identity-safe, live-verified.

### Detail of changes made:
- **crates.io** (`src/lib/crates-io.ts` + `src/lib/enrichers/crates.ts`): keys off the
  GitHub login already resolved (crates.io accounts ARE GitHub OAuth logins → no name
  guessing), confirms the crates account's GitHub URL links back, then aggregates
  published crates + downloads + top crate. `githubLoginsFromUrls` extracts the login
  from `knownUrls.github`.
- **Tranco** (`src/lib/tranco.ts` + `src/lib/enrichers/tranco.ts`): queries
  `tranco-list.eu/api/ranks/domain/<d>` for candidate company domains
  (`extractCandidateDomains`), reports the best (lowest) rank. Rubric forbids
  double-counting with Majestic Million (reach magnitude awarded at most once).
- Wiring: `EnrichmentResult.source` += `crates`, `tranco`; registered in `ENRICHERS`;
  waterfall steps + `HOST_TO_STEP` (crates.io, tranco-list.eu) + rubric blocks. Scoring
  doc → v0.0.24. Tests: `tests/lib/crates.test.ts`; `EXPECTED_SOURCES` updated.

### Context for the broader batch (what's done / coming):
- This session is working through DROdio's "keyless batch + identity fingerprint" list.
- DONE earlier: `[kaggle]` (#359). DONE here: crates, tranco.
- NEXT (this session): Wayback + crt.sh founding-date; SEC EDGAR full-text (investor AUM);
  identity-fingerprint primitive → Semantic Scholar / arXiv / ORCID.
- DEFERRED with reasons: Stack Exchange (keyless 300/day shared-per-IP would starve the
  existing SO enricher — needs `STACK_EXCHANGE_KEY` for 10k/day); GDELT (1-req/5s global
  rate limit → unreliable per-eval); RubyGems/PyPI/NuGet (no clean *precise* per-user API).
  Wikipedia pageviews ALREADY exists in `enrichers/wikipedia.ts`.

### Potential concerns to address:
- crates.io confirmation assumes the crates login == GitHub login (true via OAuth); a
  GitHub *org* URL simply 404s on crates.io → safely empty, no false positives.
- Tranco names the domain in the fact so the LLM can judge relevance, but a candidate
  domain could be the person's blog, not the company — the rubric's MM-dedup keeps it
  from inflating score.
