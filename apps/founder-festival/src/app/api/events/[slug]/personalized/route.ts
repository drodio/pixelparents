import { NextResponse } from "next/server";
import { getEventBySlug } from "@/lib/events";
import { getViewerEvaluationId, isEventAttendee } from "@/lib/attendee";
import {
  buildProfileSummary,
  gatherEventLearnings,
  personalizedPrompt,
  generatePersonalizedAI,
} from "@/lib/personalized-learnings";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST /api/events/:slug/personalized — generate the viewer's OWN personalized
// learnings for this event (AI Gateway). Gated to claimed members; only feeds the
// model the learnings tiers the viewer is entitled to (attendee tier only for
// actual attendees), so it can't leak gated content.
export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewerEvalId = await getViewerEvaluationId();
  if (!viewerEvalId) return NextResponse.json({ error: "claim your profile to use this" }, { status: 403 });

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  const isAttendee = await isEventAttendee(event.id, viewerEvalId);

  const entitled = {
    title: event.title,
    learningsPublic: event.learningsPublic,
    learningsMembers: event.learningsMembers, // claimed member (always true here)
    learningsAttendees: isAttendee ? event.learningsAttendees : null,
  };

  const { summary, firstName } = await buildProfileSummary(viewerEvalId);
  const prompt = personalizedPrompt(firstName, summary, gatherEventLearnings(entitled));
  const r = await generatePersonalizedAI(prompt);
  return NextResponse.json({ ok: true, firstName, html: r.html });
}
