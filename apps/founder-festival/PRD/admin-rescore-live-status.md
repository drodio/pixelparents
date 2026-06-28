## Progress Update as of 2026-06-08 10:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the admin job detail page (`/admin/profiles/[jobId]`) appearing "stuck" during a **re-score** run. The job was actually progressing fine — the page just gave no per-row feedback. Added a live status pill next to each row's LinkedIn icon (queued / resolving… / scoring… / failed / skipped) plus a live score overlay, both driven by the existing 4s job poll.

### Detail of changes made:
- Root cause: re-score jobs reuse existing evals, so `listProfilesForJob` returns all items as already-scored rows. The in-flight "ghost row" status path in `ProfilesScoredTable` dedupes those out (their LinkedIn URL already matches a scored row), and the regular rows only show status when `showStatus` is passed — which the detail page doesn't. Net effect: 93 static rows, no indication anything is happening, even though the cron is scoring ~5/min.
- `src/components/admin/ProfilesScoredTable.tsx`:
  - The existing `liveJobId` poll now also builds an `evaluationId → { status, founder, investor, combined }` map (`liveByEval`) from `json.items` (the API already returns `evaluationId` + live eval scores).
  - Each scored row renders a live status pill to the right of the LinkedIn icon while its item is in-flight (`LIVE_STATUS_LABEL`: pending/resolved→"queued", resolving→"resolving…", scoring→"scoring…", failed/skipped). The pill vanishes when the item is `done`.
  - Founder/Investor/Combined cells overlay the live eval scores from the poll, so a row's number updates the moment its re-score lands instead of waiting for the end-of-job SSR refresh. Sort order still uses the SSR values so rows don't jump around mid-run.
- The header progress bar (`JobLiveProgress`) already polled live; the `0/93` the user saw was the list-page snapshot at creation time. No change needed there.

### Potential concerns to address:
- The `/admin/profiles` list page (`RunsPanel`) Runs table is server-rendered and does NOT auto-refresh, so a running job's `N/total` there stays stale until reload. Out of scope for this fix; candidate follow-up.
- Live score overlay keys on `evaluationId`; brand-new (non-re-score) items still surface via the existing ghost-row path until their eval lands. Both paths now coexist.
