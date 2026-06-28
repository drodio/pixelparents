import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { db } from "@/db";
import { eventAttendees } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { enqueueAttendeeScoring } from "@/lib/attendee-scoring";

export const runtime = "nodejs";

// POST /api/admin/events/:id/attendees/:attendeeId/score — score the attendee's
// captured LinkedIn URL (enqueues a credit-charged 1-profile job; the cron scores
// it and links the new eval back to the attendee by linkedin_url).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; attendeeId: string }> },
) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id, attendeeId } = await params;
  if (!(await canAccessEvent(id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [row] = await db
    .select({ linkedinUrl: eventAttendees.linkedinUrl, evaluationId: eventAttendees.evaluationId })
    .from(eventAttendees)
    .where(and(eq(eventAttendees.id, attendeeId), eq(eventAttendees.eventId, id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.evaluationId) {
    return NextResponse.json({ error: "already matched" }, { status: 409 });
  }
  if (!row.linkedinUrl) {
    return NextResponse.json(
      { error: "no LinkedIn URL captured for this attendee" },
      { status: 400 },
    );
  }

  const user = await currentUser();
  const res = await enqueueAttendeeScoring([row.linkedinUrl], {
    clerkUserId: user?.id ?? null,
    createdByEmail: user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? null,
    title: "Score event attendee",
  });
  if (res.kind === "insufficient") {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        balanceCents: res.balanceCents,
        neededCents: res.neededCents,
        topupUrl: "/admin/credits",
      },
      { status: 402 },
    );
  }
  if (res.kind === "empty") {
    return NextResponse.json({ error: "nothing to score" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, jobId: res.jobId, count: res.count });
}
