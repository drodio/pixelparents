# Event Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]` checkboxes. Spec: docs/superpowers/specs/2026-06-09-event-chat-design.md.

**Goal:** A forum-style Chat on public event pages (above the attendee list): claimed members post threads, reply (nested), and upvote; 3 visibility levels (public/members/attendees, default members); @mention emails claimed members; per-thread permalink.

**Architecture:** 3 new tables (threads, comments, votes). Reads via server components filtered by `canViewChat`. Member-gated POST routes mirror the connect route. Mentions parsed from `@[Name](evalId)` markers; inline best-effort Resend email deduped via `sentEmails`.

**Tech Stack:** Next.js App Router, Drizzle (Neon/pnpm), Clerk auth, Resend, Tailwind.

---

## File structure

- `src/db/schema.ts` — add `eventChatThreads`, `eventChatComments`, `eventChatVotes`.
- `src/lib/event-chat-shared.ts` — DB-free: `ChatVisibility`, `canViewChat`, mention parse/format helpers, `VISIBILITY_LABEL`. (DB-free so client components import it without pulling `@/db`.)
- `src/lib/event-chat.ts` — server data layer: list/get/create/vote + score maps. Imports `@/db`.
- `src/lib/event-chat-email.ts` — `sendMentionEmails(...)` (Resend, claimed-only, deduped).
- `src/app/api/events/[slug]/chat/route.ts` — POST create thread.
- `src/app/api/events/[slug]/chat/[threadId]/reply/route.ts` — POST create comment.
- `src/app/api/events/[slug]/chat/vote/route.ts` — POST toggle vote.
- `src/app/(authed)/events/[slug]/chat/[threadId]/page.tsx` — permalink page.
- `src/components/events/chat/VisibilityPill.tsx`, `UpvoteButton.tsx`, `MentionInput.tsx`, `ChatComposer.tsx`, `ChatThreadList.tsx`, `ChatReplyTree.tsx`, `EventChat.tsx` (server).
- `src/app/(authed)/events/[slug]/page.tsx` — render `<EventChat>` above the Attendees `<section>`.
- Tests: `tests/lib/event-chat-shared.test.ts`.

---

### Task 1: Schema — 3 chat tables

**Files:** Modify `src/db/schema.ts` (append after the events tables).

- [ ] Add tables (match existing column/index conventions):

```ts
export const eventChatThreads = pgTable("event_chat_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  authorEvalId: uuid("author_eval_id").notNull().references(() => evaluations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  // public | members | attendees
  visibility: text("visibility").notNull().default("members"),
  mentionedEvalIds: jsonb("mentioned_eval_ids").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ eventCreatedIdx: index("event_chat_threads_event_created_idx").on(t.eventId, t.createdAt.desc()) }));

export const eventChatComments = pgTable("event_chat_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id").notNull().references(() => eventChatThreads.id, { onDelete: "cascade" }),
  parentCommentId: uuid("parent_comment_id").references((): AnyPgColumn => eventChatComments.id, { onDelete: "cascade" }),
  authorEvalId: uuid("author_eval_id").notNull().references(() => evaluations.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  mentionedEvalIds: jsonb("mentioned_eval_ids").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ threadIdx: index("event_chat_comments_thread_idx").on(t.threadId, t.createdAt), parentIdx: index("event_chat_comments_parent_idx").on(t.parentCommentId) }));

export const eventChatVotes = pgTable("event_chat_votes", {
  id: uuid("id").defaultRandom().primaryKey(),
  targetType: text("target_type").notNull(), // thread | comment
  targetId: uuid("target_id").notNull(),
  voterEvalId: uuid("voter_eval_id").notNull().references(() => evaluations.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ oneVote: uniqueIndex("event_chat_votes_unique").on(t.targetType, t.targetId, t.voterEvalId) }));
```

- [ ] `npm run db:generate`; commit schema + migration.

### Task 2: Apply migration to dev

- [ ] Idempotent apply script (mirror scripts/apply-scoring-runs-migration.ts) creating the 3 tables + indexes IF NOT EXISTS against `DATABASE_URL_UNPOOLED` (dev = ep-old-shadow). Run it. (Prod applied at deploy.)

### Task 3: `event-chat-shared.ts` (DB-free) + tests

- [ ] `ChatVisibility = "public" | "members" | "attendees"`; `VISIBILITY_LABEL` map ("Public"/"Members only"/"Attendees only").
- [ ] `canViewChat(v, { isMember, isAttendee })`: public→true; members→isMember; attendees→isAttendee.
- [ ] `canPostVisibility(v, { isMember, isAttendee })`: members/public→isMember; attendees→isAttendee.
- [ ] Mentions: marker regex `@\[([^\]]+)\]\(([0-9a-f-]{36})\)`. `parseMentionedIds(body): string[]` (dedup), `renderMentions(body)` → array of text/link segments `{ kind, text, evalId? }`.
- [ ] Test `tests/lib/event-chat-shared.test.ts`: canViewChat truth table; parseMentionedIds extracts+dedups; renderMentions splits correctly; non-uuid markers ignored.

### Task 4: `event-chat.ts` server data layer

- [ ] `listVisibleThreads(eventId, viewer)` → threads the viewer can see (filter by canViewChat using viewer.isMember/isAttendee), newest-first, with author {name, slugHref}, replyCount, score, viewerHasVoted.
- [ ] `getThreadForView(threadId, viewer)` → thread + nested comments (build tree by parentCommentId, replies sorted by score desc then createdAt asc) + author info + per-item score + viewer votes; null if not viewable.
- [ ] `createThread({ eventId, authorEvalId, title, body, visibility, mentionedEvalIds })`, `createComment({ threadId, parentCommentId, authorEvalId, body, mentionedEvalIds })`.
- [ ] `toggleVote({ targetType, targetId, voterEvalId })` → insert if absent else delete; return {voted, score}.
- [ ] `scoreMap(targetType, ids[])` and `viewerVotedSet(...)` helpers (aggregate counts via group-by).
- [ ] Author display: reuse leaderboard/profile-slug helpers (fullName + profileUrlFor).

### Task 5: `event-chat-email.ts`

- [ ] `sendMentionEmails({ event, sourceKind, sourceId, permalink, mentionedEvalIds, authorName })`: for each evalId → resolve a CLAIMED member's email (Clerk primary via users.clerkUserId, else verified profile_emails); skip if none. Dedup key `chat-mention:<sourceId>:<evalId>` in `sentEmails`. `sendRawEmail(to, subject, html)`; best-effort try/catch; never throws.

### Task 6: API routes (member-gated)

- [ ] `chat/route.ts` POST: viewerEvalId or 401; load event by slug or 404; parse {title, body, visibility, mentionedEvalIds}; validate visibility ∈ enum; if attendees → require isEventAttendee else 403; createThread; fire-and-forget sendMentionEmails(permalink=/events/<slug>/chat/<id>); return {id}.
- [ ] `[threadId]/reply/route.ts` POST: viewerEvalId or 401; load thread; canViewChat + canPost gate (attendee for attendees-only) or 403; createComment; sendMentionEmails(permalink=…/chat/<threadId>#c-<commentId>); return {id}.
- [ ] `chat/vote/route.ts` POST: viewerEvalId or 401; {targetType, targetId}; verify the target's thread is viewable (else 404); toggleVote; return {voted, score}.

### Task 7: UI components

- [ ] `VisibilityPill` (gold pill, label from VISIBILITY_LABEL).
- [ ] `UpvoteButton` (client): arrow + count; POST to /chat/vote; optimistic toggle; disabled w/ "claim to vote" title if not member.
- [ ] `MentionInput` (client): textarea; on `@token` debounce-fetch `/api/leaderboard/search?q=`; dropdown; selecting inserts `@[Name](evalId)` + tracks ids; exposes value + mentionedEvalIds.
- [ ] `ChatComposer` (client): title input + MentionInput body + visibility `<select>` (default members; hide/disable "Attendees only" if !isAttendee); POST create; on success router.refresh()/navigate to permalink.
- [ ] `ChatThreadList`/`ChatThreadRow`: HN row — UpvoteButton left, title→permalink, meta (author·time·N replies), VisibilityPill right.
- [ ] `ChatReplyTree` (client): recursive nested replies, each w/ UpvoteButton + reply composer (MentionInput) that POSTs to reply route.
- [ ] `EventChat` (server): header "Chat" + composer (if member) or claim prompt (/?find=1) + ChatThreadList.

### Task 8: Permalink page

- [ ] `events/[slug]/chat/[threadId]/page.tsx`: resolve viewer + event; getThreadForView or notFound(); render thread (VisibilityPill, body w/ renderMentions, UpvoteButton) + ChatReplyTree + top-level reply composer.

### Task 9: Wire into event page

- [ ] In `events/[slug]/page.tsx` (the Recap), compute viewer {isMember, isAttendee}; render `<EventChat event=… viewer=… />` immediately above the `<AttendeesTable>` section.

### Task 10: Verify + ship

- [ ] `npx tsc --noEmit` clean; `pnpm install` if needed; `npm run build` passes; run `tests/lib/event-chat-shared.test.ts`.
- [ ] Commit; push; open PR; **apply migration to prod** (idempotent script w/ POSTGRES_URL_NON_POOLING) before/at deploy; merge → verify prod deploy. (deploy-every-time)

## Self-review notes
- Spec coverage: visibility+default ✓ (canViewChat/canPost), participation=member ✓ (route gates), mentions+email ✓ (Task 5/6), upvotes both ✓ (votes table + UpvoteButton on thread & comment), permalink ✓ (Task 8), pill ✓, inherit visibility ✓ (comments have no own visibility; gated by thread).
- Vote uniqueness via uniqueIndex; toggle insert/delete. Mentions claimed-only in email resolver. Naming consistent (authorEvalId, mentionedEvalIds, targetType/targetId).
