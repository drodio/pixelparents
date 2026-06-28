import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { addManualAttendee } from "@/lib/event-attendees-admin";

export const runtime = "nodejs";

type Body = { evaluationId?: string };

// POST /api/admin/events/:id/attendees — add a manual attendee by evaluationId.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const evaluationId = body.evaluationId?.trim();
  if (!evaluationId) {
    return NextResponse.json({ error: "missing evaluationId" }, { status: 400 });
  }

  const result = await addManualAttendee(id, evaluationId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "failed" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
