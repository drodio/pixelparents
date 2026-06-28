## Progress Update as of 2026-06-10 9:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The combined score on a profile is now clickable — it opens a modal (anchored to the right) showing the full score "waterfall": every founder/investor line item + points, with per-dimension subtotals. Empty dimensions are omitted.

### Detail of changes made:
- New `src/components/CombinedScoreModal.tsx` — clickable score button + right-anchored dialog.
- `src/app/(authed)/profile/page.tsx` — replaced the combined-score `<span>` with `<CombinedScoreModal>`, fed the founder/investor score items (non-rejected) as {reason, points}.

### Potential concerns to address:
- Read-only view (no edit affordances); the editable ScoreTable still lives lower on the page.
