# Fix: move-event-learnings isolates only the algorithm section

## Progress Update as of 2026-06-10 6:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
`scripts/move-event-learnings.cjs` now keeps ONLY the algorithm section in attendees and
moves everything else (before AND after it) into members.

### Detail of changes made:
- Previously the split was positional (algorithm heading → end stayed in attendees), which
  wrongly left any topic below the algorithm block (e.g. a "Recurring Theme…" section) in
  attendees. Now it extracts the algorithm section from its heading to the NEXT h1/h2 and
  moves before+after to members.

### Potential concerns to address:
- Still a one-event utility (default slug 9nj5he2k); dry-run before --apply.
