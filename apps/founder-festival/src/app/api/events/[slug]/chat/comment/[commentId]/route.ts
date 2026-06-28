import { NextResponse } from "next/server";
import { getViewerEvaluationId } from "@/lib/attendee";
import { updateComment, deleteComment } from "@/lib/event-chat";
import { chatLengthError, parseMentionedIds } from "@/lib/event-chat-shared";

export const runtime = "nodejs";

// PATCH /api/events/:slug/chat/comment/:commentId — the author edits their own
// comment. Authorship is enforced in updateComment's WHERE clause.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string; commentId: string }> },
) {
  const { commentId } = await params;
  const evalId = await getViewerEvaluationId();
  if (!evalId) return NextResponse.json({ error: "claim your profile to edit" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { body?: string };
  const body = (b.body ?? "").trim();
  if (!body) return NextResponse.json({ error: "body required" }, { status: 400 });
  const lenErr = chatLengthError({ body });
  if (lenErr) return NextResponse.json({ error: lenErr }, { status: 400 });

  const ok = await updateComment({
    commentId,
    byEvalId: evalId,
    body,
    mentionedEvalIds: parseMentionedIds(body),
  });
  if (!ok) return NextResponse.json({ error: "not found or not yours" }, { status: 403 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/events/:slug/chat/comment/:commentId — the author deletes their own
// comment (tombstoned if it has replies, so the subtree survives).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string; commentId: string }> },
) {
  const { commentId } = await params;
  const evalId = await getViewerEvaluationId();
  if (!evalId) return NextResponse.json({ error: "claim your profile to delete" }, { status: 401 });

  const ok = await deleteComment({ commentId, byEvalId: evalId });
  if (!ok) return NextResponse.json({ error: "not found or not yours" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
