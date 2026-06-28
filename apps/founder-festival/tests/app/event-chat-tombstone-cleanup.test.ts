import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { events, evaluations, eventChatThreads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { IS_PROD_DB } from "../setup";

// A deleted thread is "tombstoned" (title/body → "[deleted]") only while it still
// has replies. Once the last reply is gone it has no chats and no replies, so it
// should be removed entirely — not left showing as an empty "[deleted]" row.

const rnd = () => Math.random().toString(36).slice(2, 8);

describe.skipIf(IS_PROD_DB)("event chat tombstone cleanup", () => {
  async function seed() {
    const [event] = await db
      .insert(events)
      .values({
        slug: "chat-" + rnd(),
        title: "Chat Test",
        startsAt: new Date("2026-07-01"),
        status: "open",
        criteria: {},
        source: "luma",
      })
      .returning();
    const [a] = await db
      .insert(evaluations)
      .values({ linkedinUrl: `https://linkedin.com/in/a-${rnd()}`, fullName: "Author A", score: 70, founderScore: 70, investorScore: 0, signalQuality: "high", source: "url" })
      .returning();
    const [b] = await db
      .insert(evaluations)
      .values({ linkedinUrl: `https://linkedin.com/in/b-${rnd()}`, fullName: "Author B", score: 70, founderScore: 70, investorScore: 0, signalQuality: "high", source: "url" })
      .returning();
    return { event: event!, a: a!, b: b! };
  }

  it("removes a tombstoned thread entirely when its last reply is deleted", async () => {
    const { createThread, createComment, deleteThread, deleteComment } = await import("@/lib/event-chat");
    const { event, a, b } = await seed();

    const { id: threadId } = await createThread({
      eventId: event.id,
      authorEvalId: a.id,
      title: "Hello",
      body: "world",
      visibility: "public",
      mentionedEvalIds: [],
    });
    const { id: commentId } = await createComment({
      threadId,
      parentCommentId: null,
      authorEvalId: b.id,
      body: "a reply",
      mentionedEvalIds: [],
    });

    // Author deletes the thread while it has a reply → tombstoned.
    expect(await deleteThread({ threadId, byEvalId: a.id })).toBe("tombstoned");

    // The reply author deletes the only reply → the now-empty tombstone is gone.
    expect(await deleteComment({ commentId, byEvalId: b.id })).toBe(true);

    const [row] = await db
      .select({ id: eventChatThreads.id })
      .from(eventChatThreads)
      .where(eq(eventChatThreads.id, threadId))
      .limit(1);
    expect(row).toBeUndefined();
  });

  it("deleting the last reply of a LIVE (non-tombstoned) thread keeps the thread", async () => {
    const { createThread, createComment, deleteComment } = await import("@/lib/event-chat");
    const { event, a, b } = await seed();

    const { id: threadId } = await createThread({
      eventId: event.id,
      authorEvalId: a.id,
      title: "Still alive",
      body: "real content",
      visibility: "public",
      mentionedEvalIds: [],
    });
    const { id: commentId } = await createComment({
      threadId,
      parentCommentId: null,
      authorEvalId: b.id,
      body: "a reply",
      mentionedEvalIds: [],
    });

    expect(await deleteComment({ commentId, byEvalId: b.id })).toBe(true);

    const [row] = await db
      .select({ id: eventChatThreads.id, title: eventChatThreads.title })
      .from(eventChatThreads)
      .where(eq(eventChatThreads.id, threadId))
      .limit(1);
    expect(row?.id).toBe(threadId);
    expect(row?.title).toBe("Still alive");
  });

  it("keeps a tombstoned thread that still has a reply", async () => {
    const { createThread, createComment, deleteThread, listVisibleThreads } = await import("@/lib/event-chat");
    const { event, a, b } = await seed();

    const { id: threadId } = await createThread({
      eventId: event.id,
      authorEvalId: a.id,
      title: "Hello",
      body: "world",
      visibility: "public",
      mentionedEvalIds: [],
    });
    await createComment({ threadId, parentCommentId: null, authorEvalId: b.id, body: "still here", mentionedEvalIds: [] });

    // Tombstoned (has a reply) — must remain visible while the reply survives.
    expect(await deleteThread({ threadId, byEvalId: a.id })).toBe("tombstoned");

    const threads = await listVisibleThreads(event.id, { evalId: a.id, isMember: true, isAttendee: true });
    expect(threads.find((t) => t.id === threadId)).toBeDefined();

    const [row] = await db
      .select({ id: eventChatThreads.id })
      .from(eventChatThreads)
      .where(eq(eventChatThreads.id, threadId))
      .limit(1);
    expect(row?.id).toBe(threadId);
  });

  it("listVisibleThreads hides and cleans up a pre-existing empty tombstone", async () => {
    const { createThread, listVisibleThreads } = await import("@/lib/event-chat");
    const { event, a } = await seed();

    const { id: threadId } = await createThread({
      eventId: event.id,
      authorEvalId: a.id,
      title: "Keep me",
      body: "real",
      visibility: "public",
      mentionedEvalIds: [],
    });
    // Pre-existing orphan state from before the cleanup fix: a "[deleted]" thread
    // with no comments under it.
    await db
      .update(eventChatThreads)
      .set({ title: "[deleted]", body: "[deleted]" })
      .where(eq(eventChatThreads.id, threadId));

    const threads = await listVisibleThreads(event.id, { evalId: a.id, isMember: true, isAttendee: true });
    expect(threads.find((t) => t.id === threadId)).toBeUndefined();

    const [row] = await db
      .select({ id: eventChatThreads.id })
      .from(eventChatThreads)
      .where(eq(eventChatThreads.id, threadId))
      .limit(1);
    expect(row).toBeUndefined();
  });
});
