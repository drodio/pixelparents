import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { getEventPriorities, setEventPriorities, type PriorityInput } from "@/lib/event-priorities";

export const runtime = "nodejs";

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
  return NextResponse.json({ priorities: await getEventPriorities(id) });
}

type Body = { items?: PriorityInput[] };

// POST /api/admin/events/:id/priorities — replace the event's priorities.
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
  const items = Array.isArray(body.items) ? body.items : [];
  await setEventPriorities(id, items);
  return NextResponse.json({ ok: true, priorities: await getEventPriorities(id) });
}
