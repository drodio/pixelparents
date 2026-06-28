import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { db } from "@/db";
import { events, eventPhotos } from "@/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { generatePhotoCaption } from "@/lib/photo-caption";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST /api/admin/events/:id/photos/caption-all — (re)generate AI captions for
// every photo whose caption was NOT set manually. Photos a human captioned
// (caption_manual = true) are left untouched. Returns the updated photo rows.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [event] = await db
    .select({ title: events.title, description: events.description, learnings: events.learningsPublic })
    .from(events)
    .where(eq(events.id, id))
    .limit(1);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  const photos = await db
    .select({ id: eventPhotos.id, blobUrl: eventPhotos.blobUrl, captionManual: eventPhotos.captionManual })
    .from(eventPhotos)
    .where(eq(eventPhotos.eventId, id))
    .orderBy(asc(eventPhotos.sortOrder), asc(eventPhotos.createdAt));

  const targets = photos.filter((p) => !p.captionManual);
  const updated: Record<string, string> = {};

  // Caption a few at a time so a long set doesn't run fully serial nor hammer
  // the gateway all at once.
  const CONCURRENCY = 4;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const captions = await Promise.all(
      batch.map((p) =>
        generatePhotoCaption({
          blobUrl: p.blobUrl,
          eventTitle: event.title ?? "",
          description: event.description,
          learnings: event.learnings,
        }),
      ),
    );
    await Promise.all(
      batch.map(async (p, j) => {
        const caption = captions[j];
        if (!caption) return;
        await db
          .update(eventPhotos)
          .set({ caption, captionManual: false })
          .where(and(eq(eventPhotos.id, p.id), eq(eventPhotos.eventId, id)));
        updated[p.id] = caption;
      }),
    );
  }

  return NextResponse.json({
    ok: true,
    captioned: Object.keys(updated).length,
    skipped: photos.length - targets.length,
    captions: updated,
  });
}
