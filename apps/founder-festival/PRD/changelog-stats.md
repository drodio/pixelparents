## Progress Update as of 2026-06-10 10:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added headline stat boxes to `/changelog` and removed the "Everything we ship …
Tap a badge to filter." subtitle. Four boxes (small label on top, big gold
number below, centered): **Total PRs** (all-time), and **Features /
Enhancements / Bugs fixed** in the trailing 30 days. Each box is a filter —
clicking a type box scopes the timeline to that change type; clicking it again
(or clicking Total PRs) clears back to all.

### Detail of changes made:
- `src/lib/changelog.ts` — new `ChangelogStats` type + `computeChangelogStats(entries)`.
  Derives from the already-fetched entries (no extra query). Lives in the lib (not
  the page render) so the `Date.now()` call isn't flagged by the
  `react-hooks/purity` lint rule. "Total PRs" = total entries (repo squash-merges,
  so 1 PR → 1 non-merge commit → 1 entry); per-type counts use a 30-day window.
- `src/app/(authed)/changelog/page.tsx` — removed the subtitle `<p>`; computes
  `stats = computeChangelogStats(entries)` server-side; passes `stats` to the timeline.
- `src/components/changelog/ChangelogTimeline.tsx` — new `StatBox` (label small +
  gold number below, centered, gold ring when active) and a 4-box grid above the
  existing filter controls. `selectOnlyType(t)` sets the type filter to exactly
  that type (toggle off if already sole); Total PRs clears it. Reuses the existing
  `types` filter state, so the boxes and the Type chips stay in sync.

### Potential concerns to address:
- Stats are computed from the full entries set (`getChangelogEntries` has no
  limit). If that ever gets paginated, the counts would need a dedicated query.
- "Total PRs" is a proxy (total changelog entries). Accurate as long as the repo
  keeps squash-merging; a non-squash merge or a direct push would skew it.
