# Branch: `nfx-resolve-by-handle` — progress log

Branched from `main` (after PR #70) on 2026-05-26.

Fixes intermittent investor scoring: the NFX enricher silently returned nothing
for some subjects, so investor points only appeared when Exa's web search
happened to surface the person's NFX page — a run-to-run coin flip.

## Progress Update as of 2026-05-26 3:30 PM Pacific
*(Most recent updates at top)*

### Summary
Merged latest `origin/main` (API billing/developers hardening, PRs #71/#72 — no
scoring/NFX overlap). Also committing the **v0.0.3 scoring-rubric doc audit**
(`PRD/scoring-rubric-v0.0.1.md`) done earlier this session so it ships to main
alongside the NFX fix: documents the double-verification weighting, moves NFX +
SEC EDGAR v2 from roadmap → live, adds `investorStageFocus` + score-based
low-signal routing, and notes the ±50–100pt non-determinism gap.

## Progress Update as of 2026-05-26 3:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Made NFX resolution robust to name variants by anchoring on the LinkedIn handle.

### Root cause (DROdio, eval cf123c12/f3507b07/3fcce746)
- The pipeline searches NFX with the name `extractFullName` pulls from highlights
  — for DROdio that's "Daniel Rubén Odio". NFX's `name_or_firm` search is
  near-exact: **"Daniel Rubén Odio" → 0 hits**, while "Daniel R. Odio" / "Daniel
  Odio" / "DROdio" → hits (the middle name breaks it). The only fallback was a
  `first-last` slug guess → "daniel-odio" → **null** (his real slug is the handle
  **"drodio"**). So the NFX enricher returned 0 facts on every run.
- Confirmed via live repro: token valid (exp 2026-11-22, all HTTP 200); profile
  load of slug "drodio" returns him (claimed, LinkedIn-matched, 5 investments).
- The 3 debug dumps show `nfx` ABSENT from `enrichments` in all 3 runs; the one
  run with investor points (3fcce746, +31) got them because Exa surfaced
  signal.nfx.com — i.e. nondeterministic, not from the enricher. That's the
  "sometimes investor data, sometimes not."

### Detail of changes made (`enrichers/nfx.ts`):
- New `nfxSearchTerms(fullName)`: searches the full name, then a middle-name-
  dropped "first last" variant; the loop stops at the first variant with a
  confirmed hit (usually one extra call).
- New `nfxSlugCandidates({ searchSlugs, fullName, linkedinHandle })`: tries the
  **LinkedIn handle first** (the NFX slug for claimed profiles is very often the
  handle), then name-confirmed search hits, then the first-last fallback. Every
  candidate is still identity-confirmed (nameOverlaps OR linkedinMatches) before
  acceptance, so precision is preserved — and handle-first means we pick the
  claimed/authoritative profile over a same-name duplicate.

### Verification:
- TDD: `tests/lib/nfx-resolution.test.ts` (5 tests, RED→GREEN). tsc + eslint clean.
- Live: fed the failing name "Daniel Rubén Odio" → now **9 facts, authoritative
  (LinkedIn match), slug drodio, portfolio 5** (Magic, CloudApp, Roadie,
  AltSchool, AngelList), claimed, leads rounds. Negative control (Linus Torvalds)
  → 0 facts. Investor signal is now deterministic, no longer dependent on Exa.

### Potential concerns to address:
- This fixes RECALL/consistency of the NFX source. The broader scoring
  non-determinism (±50–100 pts run-to-run) is separate and still open.
- Accent-only 2-token names (e.g. "José García") aren't covered by the
  first-last variant; add accent-stripping to `nfxSearchTerms` if it comes up.
