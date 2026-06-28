import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { removeAttendee, linkAttendeeProfile } from "@/lib/event-attendees-admin";

export const runtime = "nodejs";

// PATCH /api/admin/events/:id/attendees/:attendeeId — link this attendee row to
// a profile (the [Apply] action on a probable match, or a manual override pick).
// Body: { evaluationId }.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; attendeeId: string }> },
) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id, attendeeId } = await params;
  if (!(await canAccessEvent(id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { evaluationId?: unknown } | null;
  const evaluationId = typeof body?.evaluationId === "string" ? body.evaluationId : "";
  if (!evaluationId) return NextResponse.json({ error: "evaluationId required" }, { status: 400 });

  const result = await linkAttendeeProfile(id, attendeeId, evaluationId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === "eval_not_found" || result.error === "attendee_not_found" ? 404 : 400 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/events/:id/attendees/:attendeeId — soft-delete an attendee.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; attendeeId: string }> },
) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id, attendeeId } = await params;
  if (!(await canAccessEvent(id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ok = await removeAttendee(id, attendeeId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
