import { and, asc, desc, eq, inArray, count, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import { eventChatThreads, eventChatComments, eventChatVotes, evaluations, users } from "@/db/schema";
import { profileUrlFor } from "@/lib/profile-slug";
import { canViewChat, rankChatNodes, rewriteMentionNames, type ChatVisibility } from "@/lib/event-chat-shared";
import { preferredNameForEval, preferredNamesForEvals } from "@/lib/preferred-name";

// Server-side data layer for the event chat. Reads are filtered by the viewer's
// member/attendee flags; writes are owned by the viewer's evaluation id.

export type ChatViewer = { evalId: string | null; isMember: boolean; isAttendee: boolean };

export type Author = { evalId: string; name: string; href: string };

export type ThreadSummary = {
  id: string;
  title: string;
  body: string;
  visibility: ChatVisibility;
  author: Author;
  createdAt: string;
  replyCount: number;
  score: number;
  viewerVoted: boolean;
};

export type CommentNode = {
  id: string;
  body: string;
  author: Author;
  createdAt: string;
  score: number;
  viewerVoted: boolean;
  replies: CommentNode[];
};

export type ThreadDetail = {
  id: string;
  eventId: string;
  title: string;
  body: string;
  visibility: ChatVisibility;
  author: Author;
  createdAt: string;
  score: number;
  viewerVoted: boolean;
  comments: CommentNode[];
};

// Resolve author display (name + profile link) for a set of evaluation ids.
async function authorMap(evalIds: string[]): Promise<Map<string, Author>> {
  const map = new Map<string, Author>();
  const ids = [...new Set(evalIds)].filter(Boolean);
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      id: evaluations.id,
      fullName: evaluations.fullName,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
      clerkUsername: users.clerkUsername,
      nickname: users.nickname,
    })
    .from(evaluations)
    .leftJoin(users, eq(users.evaluationId, evaluations.id))
    .where(inArray(evaluations.id, ids));
  for (const r of rows) {
    const existing = map.get(r.id);
    // An eval can have multiple claim rows; a row carrying a nickname wins.
    if (existing && !r.nickname?.trim()) continue;
    map.set(r.id, {
      evalId: r.id,
      name: (r.nickname?.trim() || (r.fullName ?? "").trim()) || "A member",
      href: profileUrlFor({ evalId: r.id, slug: r.slug, slugKind: r.slugKind, clerkUsername: r.clerkUsername }),
    });
  }
  // Fallback for any id we couldn't resolve (deleted profile, etc.).
  for (const id of ids) {
    if (!map.has(id)) map.set(id, { evalId: id, name: "A member", href: `/profile?e=${id}` });
  }
  return map;
}

// target_id → vote count, for one target type.
async function scoreMap(targetType: "thread" | "comment", ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ id: eventChatVotes.targetId, n: count() })
    .from(eventChatVotes)
    .where(and(eq(eventChatVotes.targetType, targetType), inArray(eventChatVotes.targetId, ids)))
    .groupBy(eventChatVotes.targetId);
  for (const r of rows) map.set(r.id, Number(r.n));
  return map;
}

// Set of target ids the viewer has upvoted (for one target type).
async function votedSet(
  targetType: "thread" | "comment",
  ids: string[],
  voterEvalId: string | null,
): Promise<Set<string>> {
  if (!voterEvalId || ids.length === 0) return new Set();
  const rows = await db
    .select({ id: eventChatVotes.targetId })
    .from(eventChatVotes)
    .where(
      and(
        eq(eventChatVotes.targetType, targetType),
        eq(eventChatVotes.voterEvalId, voterEvalId),
        inArray(eventChatVotes.targetId, ids),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

// Threads of an event the viewer may see, newest first.
export async function listVisibleThreads(eventId: string, viewer: ChatViewer): Promise<ThreadSummary[]> {
  const rows = await db
    .select()
    .from(eventChatThreads)
    .where(eq(eventChatThreads.eventId, eventId))
    .orderBy(desc(eventChatThreads.createdAt));
  const visible = rows.filter((t) =>
    canViewChat(t.visibility as ChatVisibility, { isMember: viewer.isMember, isAttendee: viewer.isAttendee }),
  );
  if (visible.length === 0) return [];

  const ids = visible.map((t) => t.id);
  const mentioned = visible.flatMap((t) => t.mentionedEvalIds ?? []);
  const [authors, scores, voted, replyRows, mentionNames] = await Promise.all([
    authorMap(visible.map((t) => t.authorEvalId)),
    scoreMap("thread", ids),
    votedSet("thread", ids, viewer.evalId),
    db
      .select({ threadId: eventChatComments.threadId, n: count() })
      .from(eventChatComments)
      .where(inArray(eventChatComments.threadId, ids))
      .groupBy(eventChatComments.threadId),
    preferredNamesForEvals(mentioned),
  ]);
  const replyCount = new Map(replyRows.map((r) => [r.threadId, Number(r.n)]));

  // Orphaned tombstones: a deleted thread ("[deleted]" title+body) with no
  // replies left has no chats and no replies, so don't show it — and clean up
  // any pre-existing ones (made before deleteComment learned to remove them).
  const orphanIds = visible
    .filter((t) => t.title === "[deleted]" && t.body === "[deleted]" && (replyCount.get(t.id) ?? 0) === 0)
    .map((t) => t.id);
  if (orphanIds.length > 0) {
    // Re-check tombstone + emptiness atomically in the DELETE so a reply added
    // in the SELECT→DELETE window isn't cascade-deleted with the thread.
    await db
      .delete(eventChatThreads)
      .where(
        and(
          inArray(eventChatThreads.id, orphanIds),
          eq(eventChatThreads.title, "[deleted]"),
          eq(eventChatThreads.body, "[deleted]"),
          notExists(
            db
              .select({ one: sql`1` })
              .from(eventChatComments)
              .where(eq(eventChatComments.threadId, eventChatThreads.id)),
          ),
        ),
      );
  }
  const orphans = new Set(orphanIds);

  return visible
    .filter((t) => !orphans.has(t.id))
    .map((t) => ({
      id: t.id,
      title: rewriteMentionNames(t.title, mentionNames),
      body: rewriteMentionNames(t.body, mentionNames),
      visibility: t.visibility as ChatVisibility,
      author: authors.get(t.authorEvalId)!,
      createdAt: t.createdAt.toISOString(),
      replyCount: replyCount.get(t.id) ?? 0,
      score: scores.get(t.id) ?? 0,
      viewerVoted: voted.has(t.id),
    }));
}

// A single thread + its nested comment tree, or null if not viewable.
export async function getThreadForView(threadId: string, viewer: ChatViewer): Promise<ThreadDetail | null> {
  const [thread] = await db.select().from(eventChatThreads).where(eq(eventChatThreads.id, threadId)).limit(1);
  if (!thread) return null;
  const visibility = thread.visibility as ChatVisibility;
  if (!canViewChat(visibility, { isMember: viewer.isMember, isAttendee: viewer.isAttendee })) return null;

  const comments = await db
    .select()
    .from(eventChatComments)
    .where(eq(eventChatComments.threadId, threadId))
    .orderBy(asc(eventChatComments.createdAt));

  const commentIds = comments.map((c) => c.id);
  const mentioned = [
    ...(thread.mentionedEvalIds ?? []),
    ...comments.flatMap((c) => c.mentionedEvalIds ?? []),
  ];
  const [authors, cScores, cVoted, tScores, tVoted, mentionNames] = await Promise.all([
    authorMap([thread.authorEvalId, ...comments.map((c) => c.authorEvalId)]),
    scoreMap("comment", commentIds),
    votedSet("comment", commentIds, viewer.evalId),
    scoreMap("thread", [threadId]),
    votedSet("thread", [threadId], viewer.evalId),
    preferredNamesForEvals(mentioned),
  ]);

  // Build the tree; ranked by score desc (upvoted float up), then newest first.
  const nodes = new Map<string, CommentNode>();
  for (const c of comments) {
    nodes.set(c.id, {
      id: c.id,
      body: rewriteMentionNames(c.body, mentionNames),
      author: authors.get(c.authorEvalId)!,
      createdAt: c.createdAt.toISOString(),
      score: cScores.get(c.id) ?? 0,
      viewerVoted: cVoted.has(c.id),
      replies: [],
    });
  }
  const roots: CommentNode[] = [];
  for (const c of comments) {
    const node = nodes.get(c.id)!;
    if (c.parentCommentId && nodes.has(c.parentCommentId)) nodes.get(c.parentCommentId)!.replies.push(node);
    else roots.push(node);
  }
  const sortTree = (list: CommentNode[]) => {
    list.sort(rankChatNodes);
    list.forEach((n) => sortTree(n.replies));
  };
  sortTree(roots);

  return {
    id: thread.id,
    eventId: thread.eventId,
    title: rewriteMentionNames(thread.title, mentionNames),
    body: rewriteMentionNames(thread.body, mentionNames),
    visibility,
    author: authors.get(thread.authorEvalId)!,
    createdAt: thread.createdAt.toISOString(),
    score: tScores.get(threadId) ?? 0,
    viewerVoted: tVoted.has(threadId),
    comments: roots,
  };
}

export async function createThread(input: {
  eventId: string;
  authorEvalId: string;
  title: string;
  body: string;
  visibility: ChatVisibility;
  mentionedEvalIds: string[];
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(eventChatThreads)
    .values({
      eventId: input.eventId,
      authorEvalId: input.authorEvalId,
      title: input.title,
      body: input.body,
      visibility: input.visibility,
      mentionedEvalIds: input.mentionedEvalIds,
    })
    .returning({ id: eventChatThreads.id });
  return { id: row!.id };
}

export async function createComment(input: {
  threadId: string;
  parentCommentId: string | null;
  authorEvalId: string;
  body: string;
  mentionedEvalIds: string[];
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(eventChatComments)
    .values({
      threadId: input.threadId,
      parentCommentId: input.parentCommentId,
      authorEvalId: input.authorEvalId,
      body: input.body,
      mentionedEvalIds: input.mentionedEvalIds,
    })
    .returning({ id: eventChatComments.id });
  return { id: row!.id };
}

// --- Edit / delete (author-only) ---

// Update a comment's body + mentions. Only the author may edit (the WHERE
// includes authorEvalId). Returns true if a row was updated.
export async function updateComment(input: {
  commentId: string;
  byEvalId: string;
  body: string;
  mentionedEvalIds: string[];
}): Promise<boolean> {
  const res = await db
    .update(eventChatComments)
    .set({ body: input.body, mentionedEvalIds: input.mentionedEvalIds, updatedAt: new Date() })
    .where(and(eq(eventChatComments.id, input.commentId), eq(eventChatComments.authorEvalId, input.byEvalId)))
    .returning({ id: eventChatComments.id });
  return res.length > 0;
}

// Delete a comment (author-only). If it has child replies, soft-delete
// (tombstone) so the replies survive; otherwise hard-delete. Returns true if the
// viewer owned the comment.
export async function deleteComment(input: { commentId: string; byEvalId: string }): Promise<boolean> {
  const [own] = await db
    .select({ id: eventChatComments.id, threadId: eventChatComments.threadId })
    .from(eventChatComments)
    .where(and(eq(eventChatComments.id, input.commentId), eq(eventChatComments.authorEvalId, input.byEvalId)))
    .limit(1);
  if (!own) return false;
  const [child] = await db
    .select({ id: eventChatComments.id })
    .from(eventChatComments)
    .where(eq(eventChatComments.parentCommentId, input.commentId))
    .limit(1);
  if (child) {
    await db
      .update(eventChatComments)
      .set({ body: "[deleted]", mentionedEvalIds: [], updatedAt: new Date() })
      .where(eq(eventChatComments.id, input.commentId));
  } else {
    await db.delete(eventChatComments).where(eq(eventChatComments.id, input.commentId));
    // Deleting the last reply of an already-tombstoned thread leaves an empty
    // "[deleted]" shell with no chats and no replies — remove it entirely.
    await removeIfEmptyTombstone(own.threadId);
  }
  return true;
}

// A tombstoned thread (title+body "[deleted]") with zero comments left has no
// content to preserve, so hard-delete it. No-op for live threads or tombstones
// that still have replies.
async function removeIfEmptyTombstone(threadId: string): Promise<void> {
  const [t] = await db
    .select({ title: eventChatThreads.title, body: eventChatThreads.body })
    .from(eventChatThreads)
    .where(eq(eventChatThreads.id, threadId))
    .limit(1);
  if (!t || t.title !== "[deleted]" || t.body !== "[deleted]") return;
  const [child] = await db
    .select({ id: eventChatComments.id })
    .from(eventChatComments)
    .where(eq(eventChatComments.threadId, threadId))
    .limit(1);
  if (child) return;
  await db.delete(eventChatThreads).where(eq(eventChatThreads.id, threadId));
}

// Update a thread's title + body + mentions (author-only). Returns true if a row
// was updated.
export async function updateThread(input: {
  threadId: string;
  byEvalId: string;
  title: string;
  body: string;
  mentionedEvalIds: string[];
}): Promise<boolean> {
  const res = await db
    .update(eventChatThreads)
    .set({ title: input.title, body: input.body, mentionedEvalIds: input.mentionedEvalIds, updatedAt: new Date() })
    .where(and(eq(eventChatThreads.id, input.threadId), eq(eventChatThreads.authorEvalId, input.byEvalId)))
    .returning({ id: eventChatThreads.id });
  return res.length > 0;
}

// Delete a thread (author-only). If it has comments, tombstone title+body so the
// discussion stays intact; otherwise hard-delete. Returns "deleted" |
// "tombstoned" | null (not the owner).
export async function deleteThread(input: {
  threadId: string;
  byEvalId: string;
}): Promise<"deleted" | "tombstoned" | null> {
  const [own] = await db
    .select({ id: eventChatThreads.id })
    .from(eventChatThreads)
    .where(and(eq(eventChatThreads.id, input.threadId), eq(eventChatThreads.authorEvalId, input.byEvalId)))
    .limit(1);
  if (!own) return null;
  const [child] = await db
    .select({ id: eventChatComments.id })
    .from(eventChatComments)
    .where(eq(eventChatComments.threadId, input.threadId))
    .limit(1);
  if (child) {
    await db
      .update(eventChatThreads)
      .set({ title: "[deleted]", body: "[deleted]", mentionedEvalIds: [], updatedAt: new Date() })
      .where(eq(eventChatThreads.id, input.threadId));
    return "tombstoned";
  }
  await db.delete(eventChatThreads).where(eq(eventChatThreads.id, input.threadId));
  return "deleted";
}

// Toggle the viewer's upvote on a target; returns the new state + score.
export async function toggleVote(input: {
  targetType: "thread" | "comment";
  targetId: string;
  voterEvalId: string;
}): Promise<{ voted: boolean; score: number }> {
  const existing = await db
    .select({ id: eventChatVotes.id })
    .from(eventChatVotes)
    .where(
      and(
        eq(eventChatVotes.targetType, input.targetType),
        eq(eventChatVotes.targetId, input.targetId),
        eq(eventChatVotes.voterEvalId, input.voterEvalId),
      ),
    )
    .limit(1);
  let voted: boolean;
  if (existing[0]) {
    await db.delete(eventChatVotes).where(eq(eventChatVotes.id, existing[0].id));
    voted = false;
  } else {
    await db.insert(eventChatVotes).values({
      targetType: input.targetType,
      targetId: input.targetId,
      voterEvalId: input.voterEvalId,
    });
    voted = true;
  }
  const [{ n }] = await db
    .select({ n: count() })
    .from(eventChatVotes)
    .where(and(eq(eventChatVotes.targetType, input.targetType), eq(eventChatVotes.targetId, input.targetId)));
  return { voted, score: Number(n) };
}

// The thread a comment belongs to (for the vote route's view-gate on comments).
export async function getThreadIdForComment(commentId: string): Promise<string | null> {
  const [row] = await db
    .select({ threadId: eventChatComments.threadId })
    .from(eventChatComments)
    .where(eq(eventChatComments.id, commentId))
    .limit(1);
  return row?.threadId ?? null;
}

// Minimal thread row for gating (used by the vote route).
export async function getThreadVisibility(threadId: string): Promise<ChatVisibility | null> {
  const [row] = await db
    .select({ visibility: eventChatThreads.visibility })
    .from(eventChatThreads)
    .where(eq(eventChatThreads.id, threadId))
    .limit(1);
  return (row?.visibility as ChatVisibility) ?? null;
}

// Display name for a member's evaluation (for the mention email subject/author
// line). Prefers the owner's nickname when set.
export async function getMemberName(evalId: string): Promise<string> {
  return (await preferredNameForEval(evalId)) ?? "A member";
}

// Lightweight thread meta for write-gating (eventId + visibility), or null.
export async function getThreadMeta(
  threadId: string,
): Promise<{ eventId: string; visibility: ChatVisibility; title: string } | null> {
  const [row] = await db
    .select({
      eventId: eventChatThreads.eventId,
      visibility: eventChatThreads.visibility,
      title: eventChatThreads.title,
    })
    .from(eventChatThreads)
    .where(eq(eventChatThreads.id, threadId))
    .limit(1);
  return row ? { eventId: row.eventId, visibility: row.visibility as ChatVisibility, title: row.title } : null;
}
