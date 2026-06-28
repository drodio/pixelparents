import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { getAttendeeScoringStatuses } from "@/lib/event-attendees-admin";

export const runtime = "nodejs";

// GET /api/admin/events/:id/attendees/scoring-status — per-attendee scoring
// status keyed by eventAttendees.id, for active or recently-completed jobs.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const statuses = await getAttendeeScoringStatuses(id);
  return NextResponse.json({ statuses });
}
