import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { setEventSponsors } from "@/lib/sponsors";

export const runtime = "nodejs";

type Body = { sponsorIds?: string[] };

// POST /api/admin/events/:id/sponsors — replace the event's sponsor set (ordered).
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
  const sponsorIds = Array.isArray(body.sponsorIds) ? body.sponsorIds.filter((x) => typeof x === "string") : [];
  await setEventSponsors(id, sponsorIds);
  return NextResponse.json({ ok: true });
}
