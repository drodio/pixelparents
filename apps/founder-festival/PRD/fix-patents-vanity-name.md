## Progress Update as of 2026-06-10 08:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. After the patent COVERAGE fix (#347) shipped, a verification rescore of
`/drodio` + `/samuel-odio` showed the `patents` source was STILL absent from `/drodio`.
Diagnosed the second, deterministic root cause and fixed it: the enricher was searching
USPTO with DROdio's vanity LinkedIn display name "DROdio" instead of his legal name.

### Detail of changes made:
- **Root cause (verified, not guessed):** `runEnrichments` runs the `patents` enricher
  with `extractFullName(ctx)`, derived LIVE from the LinkedIn page. For DROdio that
  returns **"DROdio"** (his vanity display name) — a single token with no separable
  first/last — so `subjectFirstLast` returns null and every patent is dropped. Sam's
  live name resolves to "Samuel Odio", which works; his earlier absence was transient
  run-variance, reproduced as WORKING via the real `runEnrichments`.
- The legal name **does** exist on the eval row as `full_name` ("Daniel Rubén Odio"),
  set from the LLM's `scoring.fullName` on a prior scoring — but the enricher never saw it.
- **Fix:** thread `knownFullName` (the row's `full_name`) into the enricher context.
  - `EnricherContext` + `RunEnrichmentsArgs` gain `knownFullName?: string | null`.
  - New `resolvePatentName(ctx)` picks whichever of `[fullName, knownFullName]` actually
    parses into a first+last (falls back to the raw live name so first scores still try).
  - `enrichWithPatents` searches + corroborates with that resolved name.
  - `reEvaluate` passes `existing.fullName` down through `computeFreshScore` →
    `researchSubject` → `runEnrichments`. First scores pass nothing (null) — they only
    have the live name, which is acceptable; a later rescore/sweep fills it in.
- Tests: `tests/lib/patents.test.ts` +4 cases for `resolvePatentName` (vanity→legal
  fallback, keep-good-live-name, raw fallback, null). 15 pass.
- Live-verified via real `runEnrichments`: knownFullName=null → patents ABSENT;
  knownFullName="Daniel Rubén Odio" → 2 patents (1 granted, Armory).
- Scoring doc bumped to v0.0.22 (no points change — only WHICH name is searched).

### Potential concerns to address:
- **First-time scores of vanity-handle people still miss patents on pass 1** (no
  `knownFullName` yet). They self-heal on the next rescore. A fuller fix would run a
  deterministic post-LLM patent pass using `scoring.fullName`; deferred as scope.
- `extractFullName` returning a vanity handle is a broader smell — other identity-
  sensitive enrichers could share this weakness; only `patents` is hardened here.
