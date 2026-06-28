import { NextResponse } from "next/server";
import { getViewerEvaluationId, isEventAttendee } from "@/lib/attendee";
import { getEventBySlug } from "@/lib/events";
import { createComment, getMemberName, getThreadMeta } from "@/lib/event-chat";
import { canPostChat, chatLengthError, parseMentionedIds } from "@/lib/event-chat-shared";
import { sendMentionEmails } from "@/lib/event-chat-email";

export const runtime = "nodejs";

type Body = { body?: string; parentCommentId?: string | null };

// POST /api/events/:slug/chat/:threadId/reply — reply to a thread (or another
// comment). Inherits the thread's visibility for the write gate.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; threadId: string }> },
) {
  const { slug, threadId } = await params;
  const evalId = await getViewerEvaluationId();
  if (!evalId) return NextResponse.json({ error: "claim your profile to reply" }, { status: 401 });

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  const meta = await getThreadMeta(threadId);
  if (!meta || meta.eventId !== event.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isAttendee = await isEventAttendee(event.id, evalId);
  // canPost (and, for attendees-only, canView) require attendee status; this
  // gate covers both reading and posting in the thread.
  if (!canPostChat(meta.visibility, { isMember: true, isAttendee })) {
    return NextResponse.json({ error: "not allowed" }, { status: 403 });
  }

  const b = (await req.json()) as Body;
  const body = (b.body ?? "").trim();
  if (!body) return NextResponse.json({ error: "body required" }, { status: 400 });
  const lenErr = chatLengthError({ body });
  if (lenErr) return NextResponse.json({ error: lenErr }, { status: 400 });
  const parentCommentId = b.parentCommentId ?? null;

  const mentionedEvalIds = parseMentionedIds(body);
  const { id } = await createComment({
    threadId,
    parentCommentId,
    authorEvalId: evalId,
    body,
    mentionedEvalIds,
  });

  // Awaited (not fire-and-forget): Vercel serverless can suspend before an
  // un-awaited promise runs, which silently dropped these emails.
  // sendMentionEmails is internally best-effort and never throws.
  if (mentionedEvalIds.length > 0) {
    await sendMentionEmails({
      eventTitle: event.title,
      eventPath: `/events/${slug}`,
      threadTitle: meta.title,
      chatBody: body,
      sourceId: id,
      permalinkPath: `/events/${slug}/chat/${threadId}#c-${id}`,
      mentionedEvalIds,
      authorName: await getMemberName(evalId),
      authorEvalId: evalId,
    });
  }

  return NextResponse.json({ ok: true, id });
}
