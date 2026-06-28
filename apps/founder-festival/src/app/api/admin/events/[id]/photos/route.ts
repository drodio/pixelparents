import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { db } from "@/db";
import { events, eventPhotos, profileEmails } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { getViewerEvaluationId } from "@/lib/attendee";
import { getViewerEmail } from "@/lib/grants";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/admin/events/:id/photos — list photos (admin).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(eventPhotos)
    .where(eq(eventPhotos.eventId, id))
    .orderBy(asc(eventPhotos.sortOrder), asc(eventPhotos.createdAt));
  return NextResponse.json({ photos: rows });
}

// POST /api/admin/events/:id/photos — record a photo that the client already
// uploaded directly to Vercel Blob (see ./upload/route.ts for the token handshake).
// Body is small JSON `{ blobUrl, visibility?, caption? }`, so it never trips
// Vercel's ~4.5MB function request-body limit the way streaming the file did.
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

  const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, id)).limit(1);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as
    | { blobUrl?: unknown; visibility?: unknown; caption?: unknown }
    | null;
  const blobUrl = typeof body?.blobUrl === "string" ? body.blobUrl : "";
  // Only accept URLs from our own Blob store, so this endpoint can't be used to
  // attach an arbitrary external image.
  if (!/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(blobUrl)) {
    return NextResponse.json({ error: "valid blobUrl required" }, { status: 400 });
  }
  const visibility =
    body?.visibility === "attendees" || body?.visibility === "claimed" ? body.visibility : "public";
  const caption =
    typeof body?.caption === "string" && body.caption.trim() ? body.caption.trim() : null;

  // Append after the current max sort order.
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${eventPhotos.sortOrder}), -1)` })
    .from(eventPhotos)
    .where(eq(eventPhotos.eventId, id));

  // Credit the admin who added it so the recap shows "added by <name>". Prefer
  // their linked claimed profile; if their login isn't linked to an evaluation
  // (common for admin-only accounts), fall back to resolving their profile by
  // their verified Clerk email via profile_emails. Null only if neither matches.
  let uploadedByEvaluationId = await getViewerEvaluationId();
  if (!uploadedByEvaluationId) {
    const email = await getViewerEmail();
    if (email) {
      const [pe] = await db
        .select({ evaluationId: profileEmails.evaluationId })
        .from(profileEmails)
        .where(eq(profileEmails.email, email))
        .limit(1);
      uploadedByEvaluationId = pe?.evaluationId ?? null;
    }
  }

  const [row] = await db
    .insert(eventPhotos)
    .values({
      eventId: id,
      blobUrl,
      source: "admin",
      uploadedByEvaluationId,
      visibility,
      caption,
      sortOrder: Number(maxOrder) + 1,
    })
    .returning();

  return NextResponse.json({ ok: true, photo: row });
}
