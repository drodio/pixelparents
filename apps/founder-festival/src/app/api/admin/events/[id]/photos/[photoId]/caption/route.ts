import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { db } from "@/db";
import { events, eventPhotos } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { generatePhotoCaption } from "@/lib/photo-caption";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/admin/events/:id/photos/:photoId/caption — (re)generate the AI caption
// for ONE photo. Always runs (explicit per-photo "Re-Run"), even on manually
// captioned photos, and resets caption_manual=false so it's an auto caption again.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id, photoId } = await params;
  if (!(await canAccessEvent(id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [event] = await db
    .select({ title: events.title, description: events.description, learnings: events.learningsPublic })
    .from(events)
    .where(eq(events.id, id))
    .limit(1);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [photo] = await db
    .select({ id: eventPhotos.id, blobUrl: eventPhotos.blobUrl })
    .from(eventPhotos)
    .where(and(eq(eventPhotos.id, photoId), eq(eventPhotos.eventId, id)))
    .limit(1);
  if (!photo) return NextResponse.json({ error: "not found" }, { status: 404 });

  const caption = await generatePhotoCaption({
    blobUrl: photo.blobUrl,
    eventTitle: event.title ?? "",
    description: event.description,
    learnings: event.learnings,
  });
  if (!caption) return NextResponse.json({ error: "could not caption this photo" }, { status: 502 });

  const [row] = await db
    .update(eventPhotos)
    .set({ caption, captionManual: false })
    .where(and(eq(eventPhotos.id, photoId), eq(eventPhotos.eventId, id)))
    .returning();
  return NextResponse.json({ ok: true, photo: row });
}
