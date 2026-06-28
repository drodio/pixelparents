import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { db } from "@/db";
import { eventPhotos } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

type PatchBody = {
  visibility?: "public" | "claimed" | "attendees";
  caption?: string | null;
  sortOrder?: number;
};

// PATCH /api/admin/events/:id/photos/:photoId — update visibility/caption/order.
export async function PATCH(
  req: Request,
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
  const body = (await req.json()) as PatchBody;

  const set: Partial<typeof eventPhotos.$inferInsert> = {};
  if (body.visibility === "public" || body.visibility === "claimed" || body.visibility === "attendees")
    set.visibility = body.visibility;
  if (body.caption !== undefined) {
    const trimmed = body.caption?.trim() || null;
    set.caption = trimmed;
    // A human typed/cleared this. Non-empty → manual (protected from "Re-Run
    // all"); cleared → back to auto so a re-run can fill it again.
    set.captionManual = !!trimmed;
  }
  if (typeof body.sortOrder === "number") set.sortOrder = body.sortOrder;
  if (Object.keys(set).length === 0) return NextResponse.json({ error: "no changes" }, { status: 400 });

  const [row] = await db
    .update(eventPhotos)
    .set(set)
    .where(and(eq(eventPhotos.id, photoId), eq(eventPhotos.eventId, id)))
    .returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, photo: row });
}

// DELETE /api/admin/events/:id/photos/:photoId — remove the row and the blob.
export async function DELETE(
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

  const [row] = await db
    .delete(eventPhotos)
    .where(and(eq(eventPhotos.id, photoId), eq(eventPhotos.eventId, id)))
    .returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Best-effort blob cleanup; don't fail the request if it errors.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(row.blobUrl);
    } catch (err) {
      console.error("[event-photos] blob delete failed:", err);
    }
  }
  return NextResponse.json({ ok: true });
}
