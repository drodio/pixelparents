import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { sanitizeRecapHtml } from "@/lib/event-recap";

export const runtime = "nodejs";

type Body = {
  learningsPublic?: string | null;
  learningsMembers?: string | null;
  learningsAttendees?: string | null;
};

// POST /api/admin/events/:id/learnings — save the public + attendee-only recap
// learnings (TipTap HTML). Sanitized server-side as defense-in-depth.
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
  const body = (await req.json()) as Body;

  const [updated] = await db
    .update(events)
    .set({
      learningsPublic: sanitizeRecapHtml(body.learningsPublic) || null,
      learningsMembers: sanitizeRecapHtml(body.learningsMembers) || null,
      learningsAttendees: sanitizeRecapHtml(body.learningsAttendees) || null,
      updatedAt: sql`now()`,
    })
    .where(eq(events.id, id))
    .returning({ id: events.id });

  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
