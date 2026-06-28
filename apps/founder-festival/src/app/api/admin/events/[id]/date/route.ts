import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const runtime = "nodejs";

type Body = {
  // ISO instants (the client converts its datetime-local inputs via toISOString).
  startsAt?: string;
  endsAt?: string | null;
  // Short display location ("San Mateo, CA"). Sent alongside the dates.
  location?: string | null;
};

// POST /api/admin/events/:id/date — update an event's start (and optional end)
// time. startsAt is stored as a UTC instant (timestamptz); the admin UI edits in
// the festival's local time and sends an ISO string. Mirrors the other recap
// sub-editors (learnings, hosts, …).
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

  const starts = body.startsAt ? new Date(body.startsAt) : null;
  if (!starts || Number.isNaN(starts.getTime())) {
    return NextResponse.json({ error: "invalid startsAt" }, { status: 400 });
  }
  let ends: Date | null = null;
  if (body.endsAt) {
    const e = new Date(body.endsAt);
    if (Number.isNaN(e.getTime())) {
      return NextResponse.json({ error: "invalid endsAt" }, { status: 400 });
    }
    if (e.getTime() < starts.getTime()) {
      return NextResponse.json({ error: "endsAt is before startsAt" }, { status: 400 });
    }
    ends = e;
  }

  const location = typeof body.location === "string" ? body.location.trim() || null : body.location ?? undefined;
  const [updated] = await db
    .update(events)
    .set({
      startsAt: starts,
      endsAt: ends,
      ...(location !== undefined ? { location } : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(events.id, id))
    .returning({ id: events.id });

  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
