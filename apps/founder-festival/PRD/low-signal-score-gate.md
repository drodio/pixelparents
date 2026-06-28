# Branch: `low-signal-score-gate` — progress log

Branched from `main` (commit `8f4284f`, after PR #63 merged) on 2026-05-26.

Fixes a real-user bug: a profile that *was* scored (positive points) could be
hidden behind the `/not-this-round` "We couldn't find enough public information
about you" page, because the profile-vs-not-this-round decision keyed off
`signalQuality` instead of the actual score.

## Progress Update as of 2026-05-26 10:20 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Gate the profile display on the SCORE, not `signalQuality` (option A of the
diagnosis). Discovered via an applicant (eval `ac989cb5`): scored **25** points —
20 of them authoritative from a SEC Form D filing (named on Acme, Inc.'s
$1.9M offering) — yet routed to `/not-this-round` because Claude rated their thin
web footprint `signalQuality: "low"`.

### Root cause
- `signalQuality` is Claude's judgment of public-web breadth (`'low' = almost no
  public info`). The SEC EDGAR enricher finds Form D filings *independently* of
  the web search, so a person with a thin footprint can still earn real,
  authoritative points.
- The status decision used `signalQuality === "low" → "low-signal"`, and both
  the client (SplashForm/ReScoreButton/MismatchOverlay) and the server
  (`profile/page.tsx` redirect + metadata) gated on that. The rubric itself says
  (`scoring.ts:223`) "signalQuality is METADATA — it never prevents scoring" —
  but the pipeline used it to prevent the profile from being *shown*.

### Detail of changes made:
- `eval-pipeline.ts`: new exported `deriveEvalStatus(combinedScore)` →
  `score > 0 ? "scored" : "low-signal"`. `rowToResult` now uses it (was
  `row.signalQuality === "low" ? …`). The genuine no-signal case (research
  short-circuit) still writes score 0 → "low-signal", unchanged.
- `profile/page.tsx`: the two server-side `signalQuality === "low"` gates (the
  `/not-this-round` redirect and the OG-metadata skip) now call
  `deriveEvalStatus(row.score)` — single source of truth, so a scored profile
  can't be bounced back server-side.
- `signalQuality` stays as display-only metadata (Score Detail, etc.).

### Verification:
- TDD: `tests/lib/eval-status.test.ts` (RED → GREEN). tsc + eslint clean on
  changed files (the 2 lint findings in profile/page.tsx lines 399–400 are the
  pre-existing logo `<a>`/`<img>`). `eval-pipeline.test.ts` 4/4 (low-signal +
  end-to-end both flow through deriveEvalStatus now).

### Potential concerns to address:
- A stale `/not-this-round?e=…` link for an eval that now scores >0 won't auto
  redirect to `/profile` (edge case; the main eval→profile flow is fixed).
