## Progress Update as of June 30, 2026 — 4:10 PM Pacific

### Summary of changes since last update
Made the entire resource-board card on the Resources index clickable to open the board, not just the gaps between content. The card already had a stretched overlay <Link> at z-0, but every content block was `relative z-10`, so it sat ABOVE the link and intercepted clicks. Switched the non-interactive content to `pointer-events-none` (so clicks fall through to the overlay link) while keeping the upvote control `pointer-events-auto`, and added `cursor-pointer` to the card.

### Detail of changes made:
- app/(authed)/resources/resources-client.tsx (BoardCard): title block, description, tag wrapper, and footer now `pointer-events-none`; upvote container now `pointer-events-auto`; card root gains `cursor-pointer`.
- Standard "stretched link" pattern — overlay <Link> stays at inset-0 z-0 and now receives clicks across the whole surface; upvote button still works because it re-enables pointer events above the link.

### Potential concerns to address:
- Tag badges inside a card are now non-interactive (they were display-only here; the filter chips live in the separate strip), which is the intended behavior — whole card navigates.
