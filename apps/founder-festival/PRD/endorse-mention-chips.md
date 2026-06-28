## Progress Update as of 2026-06-10 10:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Replaced the endorsement compose box's plain-textarea @mention (mirror-overlay) with a TipTap chip editor. Mentions are now atomic GOLD chips with NO leading "@" and that never wrap mid-name — fixing the textarea approach's limits (it couldn't drop the @ or stop wrapping without the gold drifting off the caret).

### Detail of changes made:
- New `src/components/MentionChipInput.tsx` — TipTap (StarterKit + shared MentionLink/mentionSuggestion), serializes the doc back to the `@[Name](evalId)` marker format the app stores/renders. Placeholder via a simple overlay; immediatelyRender:false for SSR.
- `src/app/globals.css` — `.mention` chips styled gold + `white-space:nowrap` (also makes rendered mentions gold everywhere).
- `src/components/MemberEndorsements.tsx` — endorse box now uses MentionChipInput. (Event chat still uses the textarea MentionInput.)

### Potential concerns to address:
- Editing an existing endorsement's text isn't pre-filled yet (the chip editor starts empty) — the separate "edit my endorsement" feature will add initialBody support.
