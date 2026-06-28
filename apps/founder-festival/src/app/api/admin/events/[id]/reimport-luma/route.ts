import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { reimportLumaEvent } from "@/lib/luma-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/admin/events/:id/reimport-luma — refresh this event's Luma fields
// (title, description, cover, date, venue, lu.ma URL) from the current Luma data.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const r = await reimportLumaEvent(id);
    return NextResponse.json({ ok: true, title: r.title });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "re-import failed" }, { status: 400 });
  }
}
