# @mention members in photo captions

## Progress Update as of 2026-06-09 12:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Photo captions now support @-mentioning members; mentions render as gold profile
links in the carousel. Works on both the admin manager and the attendee uploader.

### Detail of changes made:
- New `CaptionMentionInput` (client) — single-line caption input with an `@` autocomplete
  over claimed members (reuses `/api/leaderboard/search` + the chat token format
  `@[Name](evalId)` from `event-chat-shared`). Reports the SERIALIZED caption via `onChange`;
  mount-initialized from `initial` (remount via React `key` to push an external value).
- `EventPhotoManager` `CaptionInput`: swapped its plain input for `CaptionMentionInput`
  (keeps the 0.6s debounced auto-save + Saving/Saved indicator). The existing `capVer` key
  already remounts it after auto-caption/clear.
- `AttendeePhotoUpload`: staged-grid caption field swapped for `CaptionMentionInput`; added
  `capVer` per item, bumped on auto-caption/clear so the input remounts with the new value.
- `PhotoCarousel`: caption rendered via `renderMentions` — mention segments become
  `<a href="/profile?e=evalId">@Name</a>` (gold); `alt`/lightbox alt use `mentionsToText`
  so raw markers don't leak into a11y text.

### Potential concerns to address:
- Captions are stored serialized (`@[Name](evalId)`). Any other surface that displays a
  caption as raw text should run it through `renderMentions`/`mentionsToText` (only the
  carousel shows captions today).
- Mentions are manual; AI auto-captions never insert them (no face recognition).
- No migration — `caption` is plain text and already holds the serialized form.
