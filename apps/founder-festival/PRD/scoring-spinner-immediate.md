## Progress Update as of 2026-06-10 3:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
On the scoring waterfall, the gold "Scoring…" spinner line now starts the moment the gold progress bar begins to fill (scoreComputing), instead of one step later when the first finding folds in (inTally).

### Detail of changes made:
- `src/components/EvalProgress.tsx`: the gold spinner line condition changed from `inTally` to `scoreComputing && finale.length > 0`. `inTally` still gates findings + scroll.

### Potential concerns to address:
- None — purely the spinner's start timing; bar/findings/scroll behavior unchanged.
