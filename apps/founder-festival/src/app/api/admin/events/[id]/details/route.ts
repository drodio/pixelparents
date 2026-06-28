import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { sanitizeRecapHtml } from "@/lib/event-recap";

export const runtime = "nodejs";

type Body = { title?: string; description?: string | null };

// PATCH /api/admin/events/:id/details — edit the event title + description
// (the Luma-imported fields). Title is required + non-empty.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Body | null;
  const set: { title?: string; description?: string | null; updatedAt?: ReturnType<typeof sql> } = {};
  if (typeof body?.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "title is required" }, { status: 400 });
    set.title = t.slice(0, 300);
  }
  if (body?.description !== undefined) {
    const d = typeof body.description === "string" ? sanitizeRecapHtml(body.description) : "";
    set.description = d.trim() ? d : null;
  }
  if (set.title === undefined && set.description === undefined) {
    return NextResponse.json({ error: "no changes" }, { status: 400 });
  }
  set.updatedAt = sql`now()`;
  const [row] = await db.update(events).set(set).where(eq(events.id, id)).returning({ id: events.id });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
