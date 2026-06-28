import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { requireGrant } from "@/lib/grants";

export const runtime = "nodejs";

// POST /api/admin/events/:id/title — rename an event. Body: { title }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title can’t be empty" }, { status: 400 });

  const [row] = await db
    .update(events)
    .set({ title: title.slice(0, 200), updatedAt: new Date() })
    .where(eq(events.id, id))
    .returning({ id: events.id, title: events.title });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, title: row.title });
}
