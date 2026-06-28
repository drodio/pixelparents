# Event Chat — design

**Date:** 2026-06-09
**Branch:** `event-chat`
**Status:** approved (DROdio)

## Goal

Add a forum-style "Chat" to public event pages, directly above the Attendees
list. Claimed members can post threads, reply (HN-style nesting), and upvote both
threads and replies. Each thread has a visibility level (public / members only /
attendees only, default **members only**) shown as a pill; replies inherit the
thread's visibility. `@`-mentioning a claimed member emails them a link to the
thread. Each thread has a permalink.

## Existing patterns this builds on

- Public event page: `src/app/(authed)/events/[slug]/page.tsx` — renders the
  `Recap` with `<AttendeesTable>` (the `Attendees` `<section>`). Chat goes
  immediately **above** that section.
- Identity: `getViewerEvaluationId()` / `getCurrentViewerContext()` →
  `ownEvaluationId` (claimed member, or null). `isEventAttendee(eventId, evalId)`
  (`src/lib/attendee.ts`) → approved RSVP. "Member" = claimed = has
  `users.evaluationId`.
- Visibility precedent: `PhotoVisibility = "public" | "claimed" | "attendees"`
  + `canViewPhoto(visibility, { isClaimed, isAttendee })` (`src/lib/event-recap.ts`).
  Attendees-only pill styling: gold `bg-[#dfa43a] text-black` pill in a
  `border-[#dfa43a]/30 bg-[#dfa43a]/5` section.
- Email: Resend via `sendRawEmail()` (`src/lib/email.ts`); recipient = member's
  Clerk primary email (fallback verified `profile_emails`). `sentEmails` table
  for idempotency. Connection-request route sends inline (best-effort) — we
  mirror that for mention emails.
- Member search (mention autocomplete): `GET /api/leaderboard/search?q=<name>`
  (`searchLeaderboard`) returns `LeaderboardRow[]` (id = evaluationId, fullName,
  companyName, slug).
- Authed write template: `POST /api/events/[slug]/connect/route.ts` — resolve
  `getViewerEvaluationId()` (401 if null), gate `isEventAttendee` when needed,
  write rows owned by the viewer.

## Visibility & participation

Chat visibility values: **`public | members | attendees`** (default `members`).
A shared `canViewChat(visibility, { isMember, isAttendee })`:
- `public` → everyone (incl. logged-out)
- `members` → `isMember` (claimed)
- `attendees` → `isAttendee` (approved attendee of that event)

**Participation requires a claimed profile.** Write gates:
- Create thread / reply / upvote → must be a claimed member.
- Create or reply in an **attendees-only** thread → must be an attendee of the event.
- Replies inherit the thread visibility for BOTH read and the write gate.
- Logged-out / unclaimed: can read public threads; participation controls show a
  "claim your profile" prompt linking to `/?find=1`.

## Data model (4 new tables in `src/db/schema.ts`)

```
event_chat_threads
  id                uuid pk
  event_id          uuid → events.id (on delete cascade)
  author_eval_id    uuid → evaluations.id   -- the claimed member who posted
  title             text not null
  body              text not null            -- plain text + @mention markers
  visibility        text not null default 'members'  -- public|members|attendees
  mentioned_eval_ids jsonb $type<string[]> default '[]'
  created_at, updated_at  timestamptz
  index (event_id, created_at desc)

event_chat_comments
  id                uuid pk
  thread_id         uuid → event_chat_threads.id (cascade)
  parent_comment_id uuid → event_chat_comments.id (nullable, self FK; HN nesting)
  author_eval_id    uuid → evaluations.id
  body              text not null
  mentioned_eval_ids jsonb $type<string[]> default '[]'
  created_at, updated_at  timestamptz
  index (thread_id, created_at), index (parent_comment_id)

event_chat_votes      -- upvotes on threads AND comments (one per member per item)
  id                uuid pk
  target_type       text not null            -- 'thread' | 'comment'
  target_id         uuid not null
  voter_eval_id     uuid → evaluations.id
  created_at        timestamptz
  unique (target_type, target_id, voter_eval_id)
```

Score of a thread/comment = `count(*)` from `event_chat_votes` for that target.
No denormalized counter in v1 (counts are small; aggregate at read).

Migration is additive: `db:generate` for the file, apply via idempotent
`CREATE TABLE IF NOT EXISTS` to dev (and prod at deploy) per the pnpm/Neon
deploy gotchas — never `db:push`.

## Mentions

The composer's `@` autocomplete hits `/api/leaderboard/search`. Selecting a
person inserts a marker `@[Full Name](<evaluationId>)` into the body and adds the
id to `mentioned_eval_ids`. Rendering parses markers → a link to that member's
profile. On create, the server resolves each `mentioned_eval_ids` entry to a
**claimed** member's email and sends (inline, best-effort) a "You were mentioned
in <Event> chat" email with a permalink (anchored to the comment for replies).
Deduped via `sentEmails` key `chat-mention:<commentOrThreadId>:<evalId>` so an
edit/re-render never re-notifies. Only claimed profiles are emailed.

## APIs (member-gated; author = current viewer)

- `POST /api/events/[slug]/chat` — `{ title, body, visibility, mentionedEvalIds }`
  → create thread. Gates: claimed; attendee if visibility=attendees.
- `POST /api/events/[slug]/chat/[threadId]/reply` —
  `{ body, parentCommentId?, mentionedEvalIds }` → create comment. Inherits
  thread visibility for the write gate.
- `POST /api/events/[slug]/chat/vote` — `{ targetType, targetId }` → toggle the
  viewer's upvote (insert/delete the unique row). Claimed; must be able to view
  the target's thread.
- Reads are server components (event page section + permalink page), filtered by
  `canViewChat`. Mention search reuses the leaderboard search endpoint.

All write routes 401 if not claimed, 403 if visibility gate fails, 404 if the
event/thread isn't visible to the viewer.

## UI components (`src/components/events/chat/`)

- `EventChat` (server) — loads visible threads + the viewer's vote set; renders
  the section header "Chat", the composer, and the thread list.
- `ChatThreadList` / `ChatThreadRow` (client) — HN-style row: `UpvoteButton`
  (arrow + count) on the left, title (links to permalink), meta line
  (author · relative time · reply count), `VisibilityPill` on the right.
- `ChatComposer` (client) — title, body via `MentionInput`, visibility select
  (default Members only; "Attendees only" disabled/hidden for non-attendees).
- `MentionInput` (client) — textarea with `@` autocomplete (debounced leaderboard
  search), inserts markers + tracks mentionedEvalIds.
- Permalink page `src/app/(authed)/events/[slug]/chat/[threadId]/page.tsx` —
  the thread + nested replies (`ChatReply`, recursive), each upvotable, with a
  reply composer. Enforces `canViewChat`; `notFound()` if not viewable.
- `VisibilityPill`, `UpvoteButton` shared.

Ordering: threads newest-first (show upvote count); replies ranked by upvotes
desc, then oldest.

## Testing

- `canViewChat` truth table for each viewer type × visibility.
- One-upvote-per-member uniqueness (toggle insert/delete).
- Mention parsing: body markers → `mentionedEvalIds`; recipient resolution skips
  unclaimed; dedup key prevents double-send.
- Permalink access control: members-only/attendees-only `notFound()` for
  ineligible viewers.
- Write-route gates (claimed required; attendee required for attendees-only).

## Out of scope (v1)

- Edit/delete of threads/comments (could add author-only later).
- Realtime updates (page refresh / revalidate is fine).
- Rich text / images in posts (plain text + mentions only).
- Notification preferences / digest (mentions email immediately; no opt-out UI yet).
- Moderation tooling beyond superadmin DB access.
