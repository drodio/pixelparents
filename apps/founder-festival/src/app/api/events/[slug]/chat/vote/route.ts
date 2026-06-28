import { NextResponse } from "next/server";
import { getViewerEvaluationId, isEventAttendee } from "@/lib/attendee";
import { getEventBySlug } from "@/lib/events";
import { toggleVote, getThreadMeta, getThreadIdForComment } from "@/lib/event-chat";
import { canViewChat } from "@/lib/event-chat-shared";

export const runtime = "nodejs";

type Body = { targetType?: string; targetId?: string };

// POST /api/events/:slug/chat/vote — toggle the viewer's upvote on a thread or
// comment. Claimed members only; the target must be visible to the viewer.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const evalId = await getViewerEvaluationId();
  if (!evalId) return NextResponse.json({ error: "claim your profile to vote" }, { status: 401 });

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  const b = (await req.json()) as Body;
  const targetType = b.targetType;
  const targetId = b.targetId;
  if ((targetType !== "thread" && targetType !== "comment") || !targetId) {
    return NextResponse.json({ error: "bad target" }, { status: 400 });
  }

  // Resolve the owning thread to gate on its visibility.
  const threadId = targetType === "thread" ? targetId : await getThreadIdForComment(targetId);
  const meta = threadId ? await getThreadMeta(threadId) : null;
  if (!meta || meta.eventId !== event.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isAttendee = await isEventAttendee(event.id, evalId);
  if (!canViewChat(meta.visibility, { isMember: true, isAttendee })) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { voted, score } = await toggleVote({ targetType, targetId, voterEvalId: evalId });
  return NextResponse.json({ ok: true, voted, score });
}
