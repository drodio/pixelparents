import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { getStoredPersonalizedForEvent } from "@/lib/personalized-store";
import { getStoredConnectionsForEvent } from "@/lib/recommended-connections-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/events/:id/insights-status — lightweight per-eval generation
// status (status strings only) for both insight kinds, so the admin attendee
// rows can poll while anything is "generating" and refresh once it settles.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [pers, conn] = await Promise.all([
    getStoredPersonalizedForEvent(id),
    getStoredConnectionsForEvent(id),
  ]);
  const statusOf = (m: Record<string, { status: string }>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.status]));
  return NextResponse.json({ learnings: statusOf(pers), connections: statusOf(conn) });
}
