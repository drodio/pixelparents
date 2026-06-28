import { NextResponse } from "next/server";
import { getViewerEvaluationId } from "@/lib/attendee";
import { updateThread, deleteThread } from "@/lib/event-chat";
import { chatLengthError, parseMentionedIds } from "@/lib/event-chat-shared";

export const runtime = "nodejs";

// PATCH /api/events/:slug/chat/:threadId — the author edits their own thread's
// title + body. Authorship is enforced in updateThread's WHERE clause.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string; threadId: string }> },
) {
  const { threadId } = await params;
  const evalId = await getViewerEvaluationId();
  if (!evalId) return NextResponse.json({ error: "claim your profile to edit" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { title?: string; body?: string };
  const title = (b.title ?? "").trim();
  const body = (b.body ?? "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "body required" }, { status: 400 });
  const lenErr = chatLengthError({ title, body });
  if (lenErr) return NextResponse.json({ error: lenErr }, { status: 400 });

  const ok = await updateThread({
    threadId,
    byEvalId: evalId,
    title,
    body,
    mentionedEvalIds: parseMentionedIds(`${title}\n${body}`),
  });
  if (!ok) return NextResponse.json({ error: "not found or not yours" }, { status: 403 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/events/:slug/chat/:threadId — the author deletes their own thread
// (tombstoned if it has replies). `mode` tells the client whether the thread is
// gone ("deleted" → navigate away) or kept as a tombstone ("tombstoned").
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string; threadId: string }> },
) {
  const { threadId } = await params;
  const evalId = await getViewerEvaluationId();
  if (!evalId) return NextResponse.json({ error: "claim your profile to delete" }, { status: 401 });

  const mode = await deleteThread({ threadId, byEvalId: evalId });
  if (!mode) return NextResponse.json({ error: "not found or not yours" }, { status: 403 });
  return NextResponse.json({ ok: true, mode });
}
