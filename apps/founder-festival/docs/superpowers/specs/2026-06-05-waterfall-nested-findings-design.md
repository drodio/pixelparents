# Waterfall: nested findings — design

**Date:** 2026-06-05
**Branch:** `worktree-admin-3005`
**Status:** approved (DROdio)

## Goal

In the scoring waterfall (`EvalProgress`, shared by SplashForm's initial eval and
ReScoreButton's re-score), the findings currently render as a flat list of rows
appended after the `EVAL_STEPS` checklist (after "Computing your score"). Instead,
each finding should fold in as an **indented sub-bullet nested under the
checkmarked step that produced it** — no separate "computing score" rows. The
Founder/Investor/Total scoreboard still ticks up as findings reveal.

## Current behavior

- `EVAL_STEPS` (src/lib/eval-steps.ts): 23 research-step labels.
- `buildFoundIdentities(found)`: "Found you on GitHub: DROdio" lines (points 0).
- `buildScoreTally(founder, investor)`: turns nonzero breakdown rows into
  "Folding in <reason>" tally items, sorted biggest-points-first. Drops the
  breakdown items' `sources`.
- `EvalProgress`: builds `allSteps = [...steps, ...finale.map(f => f.text)]` and
  reveals them one at a time (research pace, then TALLY_MS for finale), holding
  the last research step's spinner until `done`. Scoreboard sums revealed finale
  items. Ends with a "Finalizing your profile…" dwell.

## New behavior

Two phases:
1. **Research** (unchanged): steps tick through; the last research step holds its
   spinner until `done`, then all steps snap to checkmarks.
2. **Findings**: each finding folds in (TALLY_MS each, biggest-points-first) as a
   sub-bullet **under its parent step**, which is already checkmarked. Scoreboard
   ticks as each reveals. After the last, a short dwell, then `onAllDone`.

Low-signal (no findings) behaves exactly as today (plain checklist, no dwell).

## Finding → step mapping (approach A)

A pure helper `mapFindingToStep({ reason, sources, platform, rubric }) → number`
(index into `EVAL_STEPS`):

- **Account matches** (buildFoundIdentities) → by `platform`:
  GitHub→GitHub step, Hacker News→HN step, npm→npm, Hugging Face→HF,
  Stack Overflow→SO, NFX Signal→NFX, Neo→Neo, dev.to→dev.to.
- **Score findings** (buildScoreTally) → by the breakdown item's `sources` URL
  host:
  - github.com → "Cross-referencing GitHub…"
  - news.ycombinator.com → "Checking your Hacker News karma…"
  - ycombinator.com → "Looking for Y Combinator companies…"
  - npmjs.com → npm · huggingface.co → HF · stackoverflow.com → SO
  - producthunt.com → Product Hunt · dev.to → dev.to
  - sec.gov → "Verifying capital raised via SEC EDGAR…"
  - wikipedia.org → Wikipedia · wikidata.org → Wikidata
  - nfx.com → NFX · neo.com → Neo · tkmx.odio.dev → HN Tokenmaxxing
- **Fallback**: sources present but no recognized host (fortune.com, techcrunch,
  linkedin.com, crunchbase, …) → "Running a deep web search across your career".
- **No sources**: by rubric — founder → "Evaluating your past startup
  performance", investor → "Evaluating your investments and outcomes".

Step lookup is by a stable keyword match against the `EVAL_STEPS` labels (so the
mapping survives label copy tweaks), defined alongside `EVAL_STEPS`.

## Data changes

- `TallyItem` gains `stepIndex: number`.
- `buildScoreTally` accepts breakdown rows that include `sources?: string[]`
  (the /api/eval + /api/rescore responses already return them) and sets
  `stepIndex` via `mapFindingToStep`.
- `buildFoundIdentities` sets `stepIndex` by platform.
- `mapFindingToStep` exported for unit testing.

The reveal order stays "found-identities first, then score findings by points"
(unchanged ordering of the `finale` array); only the *rendering* re-parents them.

## EvalProgress changes

- Phase state: `completedSteps` (0..steps.length) and `revealedFindings`
  (0..finale.length). Phase 2 starts once all steps are done.
- Render: the `steps` list with check/spinner/dot as today; under each step,
  render the revealed findings whose `stepIndex` === that step, as sub-bullets
  (small dot, indented, zinc-300).
- Scoreboard: sum the first `revealedFindings` items (unchanged math).
- Remove the flat `allSteps` append and the "Finalizing…" block; keep a dwell
  (DWELL_MS) after the last finding before `onAllDone`.
- Keep `text-left` and scroll-into-view for the active step / latest finding.

## Testing

- Unit-test `mapFindingToStep`: each source host + platform → expected step
  index; fallbacks (unknown host → deep-web-search; no sources → rubric step).
- `buildScoreTally` / `buildFoundIdentities` attach the right `stepIndex`.

## Out of scope

- No change to the scoring pipeline or what counts as a finding.
- No new "source tag" persisted on breakdown items (we map from `sources` URLs).
