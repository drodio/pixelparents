## Progress Update as of 2026-06-09 — @mentions in chat thread titles
*(Most recent updates at top)*

### Summary of changes since last update
Chat thread TITLES now support @mentions (previously body-only). Fresh branch off
origin/main; pure code (no DB change — title already stored, mentionedEvalIds
column exists).

### Detail of changes made:
- MentionInput gains a `singleLine` prop → renders an <input> (with the same @
  autocomplete + marker insertion) for the title.
- ChatComposer: title is now a MentionInput (singleLine); reports the serialized
  title (with @[Name](evalId) markers).
- create-thread route parses mentions from BOTH title and body
  (parseMentionedIds(`${title}\n${body}`)) → title-mentioned members get emailed.
- New `mentionsToText` (markers → "@Name" plain text) used to render the title in
  the thread list (inside a link, so no nested mention links) and the permalink
  h1. Body still renders mentions as links via MentionText.
- Tests: +mentionsToText (17 pass). Build/typecheck/lint clean.

### Potential concerns to address:
- None — additive, no migration.
