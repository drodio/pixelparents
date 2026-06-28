import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { reorderEventPhotos } from "@/lib/events";

export const runtime = "nodejs";

// POST /api/admin/events/:id/photos/reorder — persist a new photo order after an
// admin drag-and-drop. Body: { ids: string[] } (the full ordered photo-id list).
// sortOrder is set to each id's index, so the first photo becomes the cover.
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
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });
  await reorderEventPhotos(id, ids);
  return NextResponse.json({ ok: true });
}
