# chat-newthread-on-title-row

## Progress Update as of 2026-06-09 10:10 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
On the event chat, the "+ New thread" button now sits on the same row as the
"Chat" title, to its right (was stacked below the title).

### Detail of changes made:
- `src/components/events/chat/ChatComposer.tsx`: now renders a header row with the
  "Chat" `<h2>` + the "+ New thread" trigger (justify-between → title left, button
  right). The expanded composer form renders full-width BELOW that row when open
  (button hides while open). Wrapped the return in a fragment.
- `src/components/events/chat/EventChat.tsx`: removed the standalone `<h2>Chat</h2>`
  for the member case (ChatComposer now owns it); non-members still get a plain
  title + claim prompt.

### Potential concerns to address:
- The "Chat" title is now rendered in two places (member → ChatComposer,
  non-member → EventChat); intentional given the server/client split.
