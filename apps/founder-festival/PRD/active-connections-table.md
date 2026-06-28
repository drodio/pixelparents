# active-connections-table

## Progress Update as of 2026-06-09 9:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
On the public event page, approved connections now render in a dedicated **"Your
connections"** table above the connect list, and are removed from the lower
"Connect with other attendees" table. So an active connection (e.g. Erika) shows
as a connection, not in the connect list.

### Detail of changes made:
- `src/components/events/AttendeesTable.tsx`: replaced the single `orderedRows`
  (which floated connected rows to the top of one table) with a split into
  `activeRows` (status approved OR contact shared) and `connectableRows`
  (everyone else, incl. pending in/out, denied, and the viewer's own "You" row).
  Renders a green "Your connections" `<h3>` + `ProfileMiniTable` of `activeRows`
  above the toggle-area, then a "Connect with other attendees" `<h3>` (only when
  both sections are non-empty) + the `connectableRows` table.
- Entirely client-side off the existing `conns` state, so connect/disconnect
  moves a person between the two tables reactively.
- No page/API/lib changes: this works because the low-signal gate removal (prior
  PR) means connected low-signal attendees are now present in `attendeeRows.rows`,
  and `connectionByEval` already carries their approved status.

### Potential concerns to address:
- Edge case: a connection with an attendee later admin-removed (removedByAdmin)
  won't appear (they're filtered from attendeeRows); rare, acceptable.
- Non-attendee/unclaimed viewers see the single combined table as before (no
  connection context → activeRows empty).
