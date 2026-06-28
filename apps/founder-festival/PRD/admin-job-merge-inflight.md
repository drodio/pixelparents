# Branch: `admin-job-merge-inflight` — progress log

## Progress Update as of 2026-06-03 4:10 PM Pacific — merge in-flight rows into the scored table

### Summary of changes since last update
On the /admin/profiles/[jobId] page the "In-flight subject" table was a
separate section above the rich scored table. Killed it: in-flight items
now render as faded ghost rows AT THE TOP of the one ProfilesScoredTable,
each with its status pill placed inline right after the LinkedIn icon.
The status column is no longer needed and was dropped on the single-run
view (status is implied "done" for scored rows and inline for ghosts).

### Detail of changes made:
- `src/components/admin/ProfilesScoredTable.tsx` — new `PendingItem`
  type + optional `liveJobId` prop. When set, the table polls
  `/api/admin/jobs/[liveJobId]` every 4s and renders any non-done items
  (deduped against scored rows by linkedinUrl) as ghost rows at the top.
  Ghost rows: italic name, LinkedIn icon, inline status pill, all other
  cells "—". Sort/filter/selection don't apply (ghost rows are transient).
- `src/components/admin/JobLiveProgress.tsx` — removed the in-flight
  `<table>` block (and its `ItemStatus` helper). The component is now
  just header + progress bar + cost summary; the polling logic is
  unchanged (it still drives the cron tick on localhost + triggers the
  router.refresh() on terminal status).
- `src/app/(authed)/admin/profiles/[jobId]/page.tsx` — pass
  `liveJobId={jobId}` to ProfilesScoredTable; drop the
  `profiles.length === 0` empty state (the table itself now shows
  ghost rows for pending items, which IS the in-flight state); drop
  the `showStatus` prop (the inline status replaces it).

### Verification:
- tsc + eslint clean.
- 2 pre-existing eval-pipeline DB-cache test failures confirmed to exist
  on main (`git stash && rerun`) — NOT from these changes.
- All other tests pass.

### Potential concerns to address:
- Two pollers now hit `/api/admin/jobs/[id]` independently — one in
  JobLiveProgress (progress bar + cost + cron tick) and one in the
  table (pending ghost rows). Both run every 4s, so combined ~0.5
  req/s — negligible. If it ever matters, lift the polling into a
  shared parent.
- The dedupe uses `linkedinUrl`. Name-only inputs without a resolved
  LinkedIn URL won't dedupe against their eventual scored row until
  the next pending-poll tick (when status becomes "done" and it falls
  out of `pendingItems` naturally). Worst case: a 4s flash of both a
  ghost row and the real row. Acceptable.
