# Drop the "@" prefix on rendered caption mentions

## Progress Update as of 2026-06-09 1:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Carousel captions now show a mentioned member's name in gold WITHOUT a leading "@"
(e.g. "Jordan Lee" not "@Jordan Lee"). Display-only change.

### Detail of changes made:
- `PhotoCarousel.tsx`: mention segments render `s.text.replace(/^@/, "")` so the gold
  profile link shows just the name. The shared `renderMentions`/token format is unchanged
  (chat still shows "@Name"); captions are still stored as `@[Name](evalId)`.

### Potential concerns to address:
- None. The `@` autocomplete in the caption input still uses "@" to trigger; only the
  rendered carousel link drops the prefix.
