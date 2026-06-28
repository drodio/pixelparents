## Progress Update as of 2026-06-10 (Pacific)
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the duplicate-profile bug where a founder with no GitHub who arrives via a second LinkedIn URL gets a "-2" twin. Diagnosed on Joshua Uwaifo (/in/ojuwaifo + /in/joshua-uwaifo-9239989a, both uefo.pro, no github) and collapsed his two profiles in prod via mergeProfiles. Added a GitHub-less dedup key: name + same dedicated website.

### Detail of changes made:
- `src/lib/identity-dedup.ts`: `isSamePersonByWebsite(a,b)` (name match + same non-generic website) + `dedupWebsiteDomain()` (excludes generic/social hosts like linkedin/medium/substack).
- `src/lib/eval-pipeline.ts` `runEval`: after the GitHub twin check, a website-keyed candidate query (`profile->identity->>websiteUrl LIKE %domain%`) + `isSamePersonByWebsite` returns the existing profile instead of creating a twin.
- Tests: `tests/lib/identity-dedup.test.ts` (+ dedupWebsiteDomain, the Joshua case, generic-host/no-website negatives). 16 pass.
- PROD DATA: merged joshua-uwaifo-2 (loser) into joshua-uwaifo (winner) via the existing mergeProfiles; the -2 slug is now an alias so the old URL still resolves.

### Potential concerns to address:
- Website match needs the website to actually be captured in profile.identity. The most bulletproof future key is the LinkedIn numeric ID (BrightData returns `linkedin_num_id`) — same person regardless of vanity URL; would need a column + backfill. Logged as a follow-up.
- The website candidate query is an unindexed JSON LIKE scan; fine at current eval volume + frequency (eval creation is already an expensive op).
