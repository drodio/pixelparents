import { NextResponse } from "next/server";
import { getEventBySlug } from "@/lib/events";
import { getViewerEvaluationId, isEventAttendee } from "@/lib/attendee";
import { generatePhotoCaption } from "@/lib/photo-caption";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/events/:slug/photos/caption — generate a suggested caption for a
// photo an attendee is about to upload (stateless: no DB write). Body { blobUrl }.
// Gated to attendees; the attendee can accept, edit, or clear the suggestion
// before saving via the normal photos POST.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewerEvalId = await getViewerEvaluationId();
  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await isEventAttendee(event.id, viewerEvalId))) {
    return NextResponse.json({ error: "attendees only" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { blobUrl?: unknown } | null;
  const blobUrl = typeof body?.blobUrl === "string" ? body.blobUrl : "";
  if (!/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(blobUrl)) {
    return NextResponse.json({ error: "valid blobUrl required" }, { status: 400 });
  }

  const caption = await generatePhotoCaption({
    blobUrl,
    eventTitle: event.title ?? "",
    description: event.description,
    learnings: event.learningsPublic,
  });
  return NextResponse.json({ ok: true, caption });
}
