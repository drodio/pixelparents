import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { setEventHosts } from "@/lib/hosts";

export const runtime = "nodejs";

type Body = { hostIds?: string[] };

// POST /api/admin/events/:id/hosts — replace the event's host set (ordered).
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
  const hostIds = Array.isArray(body.hostIds) ? body.hostIds.filter((x) => typeof x === "string") : [];
  await setEventHosts(id, hostIds);
  return NextResponse.json({ ok: true });
}
