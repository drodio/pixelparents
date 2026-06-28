import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { db } from "@/db";
import { events, evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { gatherEventLearnings } from "@/lib/personalized-learnings";
import { listEventAttendeesAdmin } from "@/lib/event-attendees-admin";
import { profileUrlFor } from "@/lib/profile-slug";
import { chiefSubmit, chiefConfigured } from "@/lib/chief";
import {
  buildConnectionsPrompt,
  siteBaseUrl,
  type AttendeeRef,
} from "@/lib/recommended-connections";
import { submitConnectionsGenerating } from "@/lib/recommended-connections-store";

export const runtime = "nodejs";
// Only SUBMITS to Chief (fast) — the chief-insights-sweep cron polls for the
// answer — so this never needs the long path.
export const maxDuration = 30;

// POST /api/admin/events/:id/connections { evalId } — generate "Attendee Insights"
// (Recommended Connections) for one attendee from this event's learnings + the
// full attendee roster, via Chief. Returns the HTML + latency/call metrics.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { evalId?: string } | null;
  const evalId = typeof body?.evalId === "string" ? body.evalId : "";
  if (!evalId) return NextResponse.json({ error: "evalId required" }, { status: 400 });

  const [event] = await db
    .select({
      title: events.title,
      slug: events.slug,
      learningsPublic: events.learningsPublic,
      learningsMembers: events.learningsMembers,
      learningsAttendees: events.learningsAttendees,
    })
    .from(events)
    .where(eq(events.id, id))
    .limit(1);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  const base = siteBaseUrl();
  const attendees = await listEventAttendeesAdmin(id);
  const matched = attendees.filter((a) => a.evaluationId && (a.name?.trim().length ?? 0) > 0);

  // Subject name + profile URL: prefer the attendee row, else the evaluation.
  const subjectRow = matched.find((a) => a.evaluationId === evalId);
  let fullName = subjectRow?.name?.trim() ?? "";
  let profileHref = subjectRow?.profileHref ?? null;
  if (!fullName) {
    const [ev] = await db
      .select({ fullName: evaluations.fullName, slug: evaluations.slug, slugKind: evaluations.slugKind })
      .from(evaluations)
      .where(eq(evaluations.id, evalId))
      .limit(1);
    fullName = ev?.fullName?.trim() ?? "this attendee";
    // Canonical profile path (/profile/<kind>/<slug> or /profile?e=<id>) — never "/<slug>".
    profileHref = profileHref ?? profileUrlFor({ evalId, slug: ev?.slug, slugKind: ev?.slugKind });
  }
  const profileUrl = profileHref ? `${base}${profileHref}` : `${base}/`;

  // Every OTHER matched attendee, as a name + profile-URL bullet list.
  const roster: AttendeeRef[] = matched
    .filter((a) => a.evaluationId !== evalId)
    .map((a) => ({ fullName: a.name!.trim(), profileUrl: a.profileHref ? `${base}${a.profileHref}` : null }));

  const prompt = buildConnectionsPrompt({
    fullName,
    eventUrl: `${base}/events/${event.slug}`,
    profileUrl,
    learningsText: gatherEventLearnings(event),
    attendees: roster,
  });

  if (!chiefConfigured()) {
    return NextResponse.json({ error: "Chief not configured (CHIEF_API_TOKEN / CHIEF_PROJECT_ID missing)." }, { status: 502 });
  }
  // Submit to Chief (fast) and record the handle as "generating"; the
  // chief-insights-sweep cron polls for the answer and stores it.
  let handle;
  try {
    handle = await chiefSubmit(prompt, { intelligence: "research", publicData: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "submit failed" }, { status: 502 });
  }
  if (!handle) return NextResponse.json({ error: "Chief submit failed (auth or API error)." }, { status: 502 });
  await submitConnectionsGenerating(id, evalId, "chief", handle.chatId, handle.messageId);
  return NextResponse.json({ ok: true, method: "chief", status: "generating" });
}
