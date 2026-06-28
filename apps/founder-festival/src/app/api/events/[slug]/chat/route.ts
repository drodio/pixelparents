import { NextResponse } from "next/server";
import { getViewerEvaluationId, isEventAttendee } from "@/lib/attendee";
import { getEventBySlug } from "@/lib/events";
import { createThread, getMemberName } from "@/lib/event-chat";
import { canPostChat, chatLengthError, isChatVisibility, parseMentionedIds } from "@/lib/event-chat-shared";
import { sendMentionEmails } from "@/lib/event-chat-email";

export const runtime = "nodejs";

type Body = { title?: string; body?: string; visibility?: string };

// POST /api/events/:slug/chat — a claimed member creates a chat thread.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const evalId = await getViewerEvaluationId();
  if (!evalId) return NextResponse.json({ error: "claim your profile to post" }, { status: 401 });

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  const b = (await req.json()) as Body;
  const title = (b.title ?? "").trim();
  const body = (b.body ?? "").trim();
  const visibility = b.visibility;
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "body required" }, { status: 400 });
  const lenErr = chatLengthError({ title, body });
  if (lenErr) return NextResponse.json({ error: lenErr }, { status: 400 });
  if (!isChatVisibility(visibility)) return NextResponse.json({ error: "bad visibility" }, { status: 400 });

  const isAttendee = await isEventAttendee(event.id, evalId);
  if (!canPostChat(visibility, { isMember: true, isAttendee })) {
    return NextResponse.json({ error: "attendees only" }, { status: 403 });
  }

  // Derive mentions from BOTH the title and body server-side (don't trust a
  // client list). parseMentionedIds dedups across the combined text.
  const mentionedEvalIds = parseMentionedIds(`${title}\n${body}`);
  const { id } = await createThread({
    eventId: event.id,
    authorEvalId: evalId,
    title,
    body,
    visibility,
    mentionedEvalIds,
  });

  // Mention emails (best-effort, deduped, claimed-only). Awaited — not
  // fire-and-forget — because Vercel serverless can suspend the function before
  // an un-awaited promise completes, which silently dropped these emails.
  // sendMentionEmails never throws into the request path (internally wrapped).
  if (mentionedEvalIds.length > 0) {
    await sendMentionEmails({
      eventTitle: event.title,
      eventPath: `/events/${slug}`,
      threadTitle: title,
      chatBody: body,
      sourceId: id,
      permalinkPath: `/events/${slug}/chat/${id}`,
      mentionedEvalIds,
      authorName: await getMemberName(evalId),
      authorEvalId: evalId,
    });
  }

  return NextResponse.json({ ok: true, id });
}
