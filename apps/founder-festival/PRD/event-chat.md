## Build complete as of 2026-06-09 — event chat
Implemented per plan: schema (3 tables, dev migration applied), event-chat-shared (canViewChat/canPostChat/mentions, 15 tests pass), event-chat server layer, mention email (Resend, claimed-only, deduped), 3 member-gated routes (thread/reply/vote), UI (EventChat/Composer/MentionInput/UpvoteButton/VisibilityPill/ReplyComposer/ChatReplyTree/MentionText), permalink page, wired above the Attendees list in the (past-event) Recap. Build/typecheck/lint clean. Verified the Chat section renders on a past dev event.

### DEPLOY ORDERING (important)
EventChat queries event_chat_threads at render → the PROD migration MUST run before the code deploys, else past event pages error. apply via scripts/apply-event-chat-migration.ts (idempotent) with the prod URL.

## Plan as of 2026-06-09
Implementation plan: docs/superpowers/plans/2026-06-09-event-chat.md. Executing inline.

## Progress Update as of 2026-06-09 — event chat forum (design)
*(Most recent updates at top)*

### Summary of changes since last update
Brainstormed + spec'd the Event Chat forum (above the attendee list on public
event pages). Fresh branch off origin/main. Spec at
docs/superpowers/specs/2026-06-09-event-chat-design.md.

### Detail of changes made:
- Design approved by DROdio. HN-style compact thread list; 3 visibility levels
  (public/members/attendees, default members) reusing the canViewPhoto-style
  gating; participation = claimed members (attendees-only requires attendee);
  @mention any claimed member (leaderboard search) → inline best-effort Resend
  email (claimed-only, deduped via sentEmails); upvotes on threads + replies
  (one per member, unique constraint); permalink page per thread.
- 4 new tables: event_chat_threads, event_chat_comments (HN nesting),
  event_chat_votes.

### Potential concerns to address:
- Additive migration → apply to dev + prod via idempotent CREATE TABLE IF NOT
  EXISTS (never db:push); pnpm-only repo, deploy-every-time.
