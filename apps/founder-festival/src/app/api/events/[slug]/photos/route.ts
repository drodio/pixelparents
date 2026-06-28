import { NextResponse } from "next/server";
import { db } from "@/db";
import { eventPhotos } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getEventBySlug } from "@/lib/events";
import { getViewerEvaluationId, isEventAttendee } from "@/lib/attendee";

export const runtime = "nodejs";

// POST /api/events/:slug/photos — record an ATTENDEE-uploaded photo (already
// pushed to Vercel Blob via the handshake route). Gated to attendees; the row is
// tagged source="attendee" + uploadedByEvaluationId so we know who added it.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewerEvalId = await getViewerEvaluationId();
  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await isEventAttendee(event.id, viewerEvalId))) {
    return NextResponse.json({ error: "attendees only" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { blobUrl?: unknown; visibility?: unknown; caption?: unknown }
    | null;
  const blobUrl = typeof body?.blobUrl === "string" ? body.blobUrl : "";
  // Only accept URLs from our own Blob store.
  if (!/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(blobUrl)) {
    return NextResponse.json({ error: "valid blobUrl required" }, { status: 400 });
  }
  // Public / Members Only ("claimed") / Attendees Only — same choices as admin.
  const visibility =
    body?.visibility === "attendees" || body?.visibility === "claimed"
      ? body.visibility
      : "public";
  const caption = typeof body?.caption === "string" && body.caption.trim() ? body.caption.trim() : null;

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${eventPhotos.sortOrder}), -1)` })
    .from(eventPhotos)
    .where(eq(eventPhotos.eventId, event.id));

  const [row] = await db
    .insert(eventPhotos)
    .values({
      eventId: event.id,
      blobUrl,
      source: "attendee",
      uploadedByEvaluationId: viewerEvalId,
      visibility,
      caption,
      sortOrder: Number(maxOrder) + 1,
    })
    .returning();

  return NextResponse.json({ ok: true, photo: row });
}
