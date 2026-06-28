import { NextResponse } from "next/server";
import { getEventBySlug } from "@/lib/events";
import { getViewerEvaluationId, isEventAttendee } from "@/lib/attendee";
import { setContactSharingMode } from "@/lib/attendee-connections";

export const runtime = "nodejs";

// POST /api/events/:slug/contact-sharing { mode } — set the viewer's per-event
// contact-sharing mode ("open_to_all" | "by_request").
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewerEvalId = await getViewerEvaluationId();
  if (!viewerEvalId) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await isEventAttendee(event.id, viewerEvalId))) {
    return NextResponse.json({ error: "attendees only" }, { status: 403 });
  }

  const { mode } = (await req.json()) as { mode?: string };
  if (mode !== "open_to_all" && mode !== "by_request") {
    return NextResponse.json({ error: "invalid mode" }, { status: 400 });
  }
  await setContactSharingMode(event.id, viewerEvalId, mode);
  return NextResponse.json({ ok: true, mode });
}
