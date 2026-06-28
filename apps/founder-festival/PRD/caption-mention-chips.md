## Progress Update as of 2026-06-10 10:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The /admin/events photo-caption input now renders @mentions as gold chips with no "@" (matching the endorse box). Generalized the chip editor for it.

### Detail of changes made:
- `src/components/MentionChipInput.tsx`: added `initialBody` (pre-fill from `@[Name](id)` markers → chips), `singleLine` (blocks Enter; single-line styling), and `className` override. Placeholder position adapts to singleLine.
- `src/components/events/CaptionMentionInput.tsx`: rewritten as a thin wrapper over MentionChipInput (singleLine, initialBody=initial). Same props/contract as before (used by EventPhotoManager).

### Potential concerns to address:
- `initialBody` support also unblocks the upcoming "edit my endorsement" pre-fill.
