## Progress Update as of 2026-06-11 12:05 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
In the endorse compose form, the "Profile points" number is now clickable and opens a small breakdown popover: "Profile points: <total>", the top-10 people you've endorsed with points spent ("-10 Jonah Larkin"), and "Remaining: <available>".

### Detail of changes made:
- `src/app/(authed)/profile/page.tsx`: compute the viewer's authored endorsements (`endorsedByMe`) for ALL members (not just owners), and pass `myAllocations` (endorsee name + points) to MemberEndorsements.
- `src/components/MemberEndorsements.tsx`: new `PointsBreakdown` popover; the points number in EndorseForm is a button that toggles it. Threaded `myAllocations` through.

### Potential concerns to address:
- The list shows authored endorsements only (top 10); "Remaining" uses the true budget.available (which also nets out co-sign contributions), so the lines may not sum to total−remaining if the viewer has co-signs.
