# Branch: `admin-profiles-source-toggle` — progress log

Branched from `main` (post `admin-hide-delete-profile` merge, commit `0d2aa6e`).

## Progress Update as of 2026-05-28 6:50 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The Source column on `/admin/profiles` ballooned vertically once a
profile had been included in many rescore runs (each run renders as a
pill in the cell). Added a page-level Show / Hide toggle for the Source
column that mirrors the existing Badges toggle, defaulting to hidden so
the page opens compact.

### Detail of changes made:
- `src/components/admin/ProfilesScoredTable.tsx`: added a `showSource`
  client state (default `false`); rendered a Show/Hide toggle next to
  the existing Badges toggle in the controls row; gated the Source
  `<th>` and `<td>` on `showSource`; adjusted `colCount` so the
  badges sub-row's `colSpan` accounts for the hidden column.
- CSV export is unchanged — Source is always included in the export
  regardless of the display toggle (mirrors how badges work in the CSV
  export comment at the top of `toCsv`).
- No DB / API changes. The Source data still loads with every row;
  this is purely a display toggle.

### Potential concerns to address:
- Sorting by Source is still functional even when the column is
  hidden (the sort header just isn't shown). If a user lands on a
  sort-by-source state via persisted UI state in the future, they
  won't see the sort indicator. We don't persist sort state today, so
  this is theoretical.
- A long Source list is still possible per-row when the column is
  shown — a follow-up could clamp the rendered runs ("first N + N
  more") if the toggle-on view also feels too tall.
