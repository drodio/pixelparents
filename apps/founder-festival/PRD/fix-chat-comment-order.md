# fix-chat-comment-order

## Progress Update as of 2026-06-14 11:23 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Changed the default ordering of chat comments/replies. Upvoted comments still
float to the top (score desc); within the same score they now sort newest-first
instead of oldest-first. Previously the date tiebreaker was ascending (oldest
first), which is the inverse of what was wanted.

### Detail of changes made:
- `src/lib/event-chat-shared.ts` — added exported pure comparator
  `rankChatNodes(a, b)` = `score desc, then createdAt desc` (ISO strings sort
  lexicographically). Lives in the DB-free shared module so it's unit-testable
  and reused as a single definition.
- `src/lib/event-chat.ts` — `getThreadForView` now sorts the comment tree with
  `rankChatNodes` (replaced the inline `rank` closure, which had `a.createdAt`
  before `b.createdAt`). Applies recursively to nested replies.
- `tests/lib/rank-chat-nodes.test.ts` — new: upvoted-above-date, newest-first
  within a score, and score-desc-then-newest tie ordering.

### Potential concerns to address:
- Thread LIST ordering (`getThreadsForEvent`, `desc(eventChatThreads.createdAt)`)
  is unchanged — it was already newest-first and the request was specifically
  about comments within a thread. Revisit if threads should also rank by score.
