## Progress Update as of 2026-06-12 06:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
No code change — fresh re-trigger push after the GitHub Actions spending budget was updated (Actions itself is Operational per githubstatus; prior failures were account-side startup_failures with steps=0 repo-wide, including main).

### Detail of changes made:
- Fresh push to pick up the new Actions billing context.

### Potential concerns to address:
- None new.

## Progress Update as of 2026-06-12 05:18 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
No code change — re-trigger push after a GitHub Actions runner startup_failure (all 3 jobs died in ~2s with no steps run) on the prior commit.

### Detail of changes made:
- Empty-ish re-trigger; the code is unchanged from the prior entry.

### Potential concerns to address:
- None new.

## Progress Update as of 2026-06-12 05:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Chat mention polish: the compose inputs now show @mentions as gold chips WITHOUT the @ (TipTap MentionChipInput, replacing the textarea-mirror); the thread title renders its mention gold + clickable (detail page) / gold non-link (list), no @; and self-mention emails now work.

### Detail of changes made:
- `ChatComposer.tsx` + `ReplyComposer.tsx`: swapped chat `MentionInput` → shared `MentionChipInput` (gold chips, no @). ReplyComposer remounts the editor via a `key` after a successful post so it clears (the chip editor is uncontrolled). Marker format is identical (`@[Name](evalId)`), so the server's parseMentionedIds is unaffected.
- Thread title: detail page `[slug]/chat/[threadId]/page.tsx` now renders the title via `MentionText` (gold + clickable, @ stripped). The list `EventChat.tsx` renders title mentions as gold non-link spans (it's already inside the thread `<Link>` — no nested anchors) via `renderMentions`.
- `event-chat-email.ts`: removed the `id !== authorEvalId` filter so a member who @mentions THEMSELVES gets the email (dedup still prevents duplicates per post).
- The chat `MentionInput.tsx` is now orphaned (left in place; harmless).

### Potential concerns to address:
- Self-mention fires on every post that mentions yourself; dedup is per (recipient, post) so no repeats, but it is one extra email per such post (intended).
- The existing thread the user already posted won't retroactively email — mention emails fire once at post time.
