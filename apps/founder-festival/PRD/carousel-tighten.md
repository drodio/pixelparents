# PRD — carousel-tighten (event-detail polish batch)

## Progress Update as of 2026-06-06 11:43 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Event-detail polish: tighter/taller cover-flow carousel without the thumbnail
strip; "Past Event: <date>" pill (date removed from below the title); an "Event
Description" heading with the description collapsed to ~2 paragraphs; and
"Learnings" → "Post-Event Learnings".

### Detail of changes made:
- `PhotoCarousel.tsx`: container ~20% taller (h 18/26/31rem); slides bigger
  (w-70% / sm:54%); neighbor step tightened (translateX d*40% vs 72%) so they
  overlap behind the center more (scale ratio 0.8^|d| unchanged); removed the
  thumbnail strip below.
- `events/[slug]/page.tsx`: past pill now "Past Event: <Month D, YYYY>" (rounded-md,
  de-uppercased); the date line below the title is shown only for UPCOMING events
  now. Wrapped the recap description in a section titled "Event Description".
  Renamed the recap "Learnings" heading to "Post-Event Learnings".
- `CollapsibleDescription.tsx`: collapses to the first 2 paragraphs (was 1);
  paragraphs split on newline runs; expand shows full text.

### Verification done:
- `next build` compiles + typechecks.

### Pending (separate): founder classification
- DROdio asks why only ~5 founders. Two factors: (a) only attendees MATCHED to a
  scored profile count; (b) classifyRole assigns each to founder OR investor by
  dominant score. He wants current/former founders counted as founders — needs a
  classifyRole change (likely founderStatus-based) + selecting founderStatus in
  getEventAnalytics. Investigating next.
