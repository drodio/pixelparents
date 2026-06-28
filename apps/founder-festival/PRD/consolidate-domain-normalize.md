# Consolidate domain normalization — consolidate-domain-normalize

## Progress Update as of 2026-06-10 — Refactor: duplication consolidation (2/2)
*(Most recent updates at top)*

### Summary of changes since last update
Introduced a single owner for HOST extraction so the same company domain hashes
identically across the MM-bonus, badges, and enricher comparison paths (the audit
flagged ~10 drifting copies → missed matches).

### Detail of changes made:
- New `src/lib/domain-normalize.ts`: `domainHost(input)` /
  `domainHostOrNull(input)` — trim → lowercase → strip http(s):// → strip a single
  leading `www.` → drop path/query/fragment. Pure, dependency-free (TDD, 9 tests).
- Migrated the host-extraction/comparison sites: badges `companyMmRank` (×2),
  eval-pipeline `addCompanyMmBonus` (×2), exa domain match, yc cache+harvest (×2),
  github `orgLoginFromDomain`, bd-datasets `companyDomain`, enrichers/identity
  corroboration, and re-pointed the two named host-extractors
  (`registrableDomain`, `websiteHost`) at the shared core (kept their TLD/null
  contracts). All behavior-preserving supersets for their (bare-domain) inputs.
- Left ALONE on purpose (different contracts): `companyNameFromDomain` brand-name
  display (leaderboard/profiles-scored/identity), `normalizeWebsite` (keeps path,
  strips trailing slash — identity dedup), LinkedIn `canonicalize`, the
  `https://${domain}` URL builders, and the no-lowercase display helpers
  (decorate-reason, exa-domain).

### Potential concerns to address:
- 5 pre-existing local test failures (rescore-all, eval-pipeline, select-top,
  hn-tokenmaxxing, app-stats) are all in vitest.ci NOT_YET_ISOLATED (DB-state /
  external API) — unchanged by this PR, not run in CI.
