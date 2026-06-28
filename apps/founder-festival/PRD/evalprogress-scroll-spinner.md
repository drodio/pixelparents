## Progress Update as of 2026-06-10 (Pacific)
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the eval/rescore progress UI jumping around during the gold-bullet phase, and added a gold "Scoring…" spinner line. Research phase still auto-scrolls down through the white checkmarks; once the gold bullets start folding in and the score drives up, the view scrolls to the TOP once and stays there (no per-finding scrolling), so the user can scroll freely.

### Detail of changes made:
- `src/components/EvalProgress.tsx`: replaced the per-finding `scrollIntoView` (which yanked the page up/down) with a two-phase scroll — research: keep active step in view; gold-bullet phase (`inTally`): scroll to top ONCE (`scrolledTopRef`) then leave it. Added a gold spinner + "Scoring your profile based on agent results" line above the first step, shown only during the gold-bullet phase (sits under the gold progress bar, spinner in the checkmark position). Removed the now-unused `finalizing`/`latestFindingRef`.

### Potential concerns to address:
- The scroll-to-top uses `scrollIntoView({block:"start"})` on the component root; works in both the splash flow and the re-score modal, but if either gains an inner scroll container the target may need to change.
