# PRD — event-desc-photos

## Progress Update as of 2026-06-06 11:05 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Fixed the collapsible event description: it split on a blank line
(`\n\n`), but Luma descriptions separate paragraphs with a SINGLE `\n`, so the
"Read more" never triggered and claimed viewers saw the whole thing. Now it
splits on a blank line if present, otherwise the first single newline.

### Detail of changes made:
- `src/components/events/CollapsibleDescription.tsx`: `splitAt` = first `\n\n`
  else first `\n`. Verified the prod 9nj5he2k description separates paragraphs
  with single `\n` ("…AI-native products.\nSwapnil founded Zeni…").

### Verification done:
- `next build` compiles + typechecks.

### Pending (separate, needs a product call):
- Private (attendee-only) photos shown blurred + lock + "Claim profile to view
  photo". CONCERN: attendee photos live in PUBLIC Vercel Blob; rendering them
  blurred via CSS puts the real URL in the page (defeats the gate). Needs a
  decision: (a) CSS blur (exposes URL), (b) generic lock placeholder (no real
  photo), or (c) server-side blurred thumbnail (private-safe, more work).
