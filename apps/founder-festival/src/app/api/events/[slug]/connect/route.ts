import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { eventAttendees } from "@/db/schema";
import { getEventBySlug } from "@/lib/events";
import { getViewerEvaluationId, isEventAttendee } from "@/lib/attendee";
import { createConnectionRequest, introduceConnection, removeConnection } from "@/lib/attendee-connections";
import { sendConnectionRequestEmail, sendConnectionPendingEmail } from "@/lib/email";
import { preferredNameForEval } from "@/lib/preferred-name";
import { canonicalProfileUrl } from "@/lib/canonical-profile-url";
import { formatEventDateLong } from "@/lib/event-format";

export const runtime = "nodejs";

// POST /api/events/:slug/connect { toEvaluationId } — request a connection with
// a fellow attendee. Requires the requester to be a signed-in attendee.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewerEvalId = await getViewerEvaluationId();
  if (!viewerEvalId) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await isEventAttendee(event.id, viewerEvalId))) {
    return NextResponse.json({ error: "attendees only" }, { status: 403 });
  }

  const { toEvaluationId } = (await req.json()) as { toEvaluationId?: string };
  if (!toEvaluationId) return NextResponse.json({ error: "toEvaluationId required" }, { status: 400 });
  if (!(await isEventAttendee(event.id, toEvaluationId))) {
    return NextResponse.json({ error: "target is not an attendee" }, { status: 400 });
  }

  try {
    const { request, autoResolved } = await createConnectionRequest(event.id, viewerEvalId, toEvaluationId);

    // Best-effort email when the request is genuinely pending (auto-handled ones
    // need no notification). Never let an email failure fail the request.
    if (request.status === "pending") {
      try {
        const [target] = await db
          .select({ email: eventAttendees.email })
          .from(eventAttendees)
          .where(and(eq(eventAttendees.eventId, event.id), eq(eventAttendees.evaluationId, toEvaluationId)))
          .limit(1);
        const fromName = await preferredNameForEval(viewerEvalId);
        const origin = new URL(req.url).origin;
        if (target?.email) {
          const base = `${origin}/connect/respond?token=${encodeURIComponent(request.token)}`;
          // Format in the festival's timezone (Vercel runs UTC → bare toLocale*
          // shifts evening-Pacific events to the next day).
          const eventDate = event.startsAt ? formatEventDateLong(event.startsAt) : undefined;
          const fromPath = await canonicalProfileUrl(viewerEvalId);
          await sendConnectionRequestEmail({
            to: target.email,
            fromName: fromName ?? "A fellow attendee",
            fromUrl: fromPath ? `${origin}${fromPath}` : undefined,
            eventTitle: event.title,
            eventUrl: `${origin}/events/${event.slug}`,
            eventDate,
            approveUrl: `${base}&action=approved`,
            denyUrl: `${base}&action=denied`,
            manageUrl: `${origin}/events/${event.slug}`,
          });
        }

        // Confirmation to the REQUESTER that their request is pending, with links
        // to manage per-event + global auto-accept prefs. Best-effort.
        const [requester] = await db
          .select({ email: eventAttendees.email })
          .from(eventAttendees)
          .where(and(eq(eventAttendees.eventId, event.id), eq(eventAttendees.evaluationId, viewerEvalId)))
          .limit(1);
        if (requester?.email) {
          const toName = (await preferredNameForEval(toEvaluationId)) ?? "this member";
          await sendConnectionPendingEmail({
            to: requester.email,
            toName,
            eventTitle: event.title,
            eventUrl: `${origin}/events/${event.slug}`,
            accountUrl: `${origin}/account`,
          });
        }
      } catch (mailErr) {
        console.error("[connect] notification email failed:", mailErr);
      }
    }

    // Auto-approved (the target had an auto_approve pref) → introduce both over
    // email now, since neither the inbox nor the token route will fire. Gate on
    // a FRESH auto-approve (autoResolved === "auto_approve") so a duplicate
    // connect click — which returns the existing row with autoResolved "ask" —
    // never re-sends. Best-effort; never fail the request on a mail error.
    if (autoResolved === "auto_approve") {
      try {
        await introduceConnection(request, new URL(req.url).origin);
      } catch (mailErr) {
        console.error("[connect] auto-approve intro email failed:", mailErr);
      }
    }

    return NextResponse.json({ ok: true, status: request.status, autoResolved });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}

// DELETE /api/events/:slug/connect { toEvaluationId } — disconnect from a fellow
// attendee. Removes the connection in either direction so it can be re-made.
export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewerEvalId = await getViewerEvaluationId();
  if (!viewerEvalId) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await isEventAttendee(event.id, viewerEvalId))) {
    return NextResponse.json({ error: "attendees only" }, { status: 403 });
  }

  const { toEvaluationId } = (await req.json().catch(() => ({}))) as { toEvaluationId?: string };
  if (!toEvaluationId) return NextResponse.json({ error: "toEvaluationId required" }, { status: 400 });

  await removeConnection(event.id, viewerEvalId, toEvaluationId);
  return NextResponse.json({ ok: true });
}
