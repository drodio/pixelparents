import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { getBadgesForEvent, setBadgesForEvent } from "@/lib/event-badges-catalog";

export const runtime = "nodejs";

// GET /api/admin/events/:id/badges-tax — the event's category badges.
// (Named "badges-tax" so it doesn't collide with the printed name-badge page.)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ badges: await getBadgesForEvent(id) });
}

// PUT /api/admin/events/:id/badges-tax { names: string[] } — replace the event's
// category badges (creating any new ones inline, deduped by slug).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { names?: unknown } | null;
  const names = Array.isArray(body?.names) ? body.names.filter((x): x is string => typeof x === "string") : [];
  const badges = await setBadgesForEvent(id, names);
  return NextResponse.json({ ok: true, badges });
}
