import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  buildProfileSummary,
  gatherEventLearnings,
  personalizedPrompt,
  generatePersonalizedAI,
  generatePersonalizedChief,
} from "@/lib/personalized-learnings";
import { storePersonalizedLearning, submitPersonalizedGenerating } from "@/lib/personalized-store";
import { chiefSubmit, chiefConfigured } from "@/lib/chief";

export const runtime = "nodejs";
// Chief "research" can take minutes; allow the long path.
export const maxDuration = 300;

// POST /api/admin/events/:id/personalized { evalId, method: "ai" | "chief" } —
// generate tailored learnings for one person from this event's learnings, using
// either the AI Gateway or Chief. Returns the HTML + cost/latency metrics so the
// admin can eval quality + cost of each backend side by side.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { evalId?: string; method?: string; async?: boolean } | null;
  const evalId = typeof body?.evalId === "string" ? body.evalId : "";
  const method = body?.method === "chief" ? "chief" : "ai";
  const wantAsync = body?.async === true; // attendee rows + bulk panel; the eval tool waits inline
  if (!evalId) return NextResponse.json({ error: "evalId required" }, { status: 400 });

  const [event] = await db
    .select({
      title: events.title,
      learningsPublic: events.learningsPublic,
      learningsMembers: events.learningsMembers,
      learningsAttendees: events.learningsAttendees,
    })
    .from(events)
    .where(eq(events.id, id))
    .limit(1);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { summary, firstName } = await buildProfileSummary(evalId);
  const prompt = personalizedPrompt(firstName, summary, gatherEventLearnings(event));

  // Async path (attendee rows / bulk panel): SUBMIT to Chief and return; the
  // chief-insights-sweep cron polls for the answer. Chief research runs longer
  // than a serverless function can stay open, so it must not be awaited inline.
  if (wantAsync) {
    if (!chiefConfigured()) {
      return NextResponse.json({ error: "Chief not configured (CHIEF_API_TOKEN / CHIEF_PROJECT_ID missing)." }, { status: 502 });
    }
    let handle;
    try {
      handle = await chiefSubmit(prompt, { intelligence: "research", publicData: true });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "submit failed" }, { status: 502 });
    }
    if (!handle) return NextResponse.json({ error: "Chief submit failed (auth or API error)." }, { status: 502 });
    await submitPersonalizedGenerating(id, evalId, "chief", handle.chatId, handle.messageId);
    return NextResponse.json({ ok: true, method: "chief", status: "generating" });
  }

  if (method === "chief") {
    const r = await generatePersonalizedChief(prompt);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 502 });
    await storePersonalizedLearning(id, evalId, "chief", r.html);
    return NextResponse.json({ ok: true, method, firstName, ...r });
  }
  const r = await generatePersonalizedAI(prompt);
  await storePersonalizedLearning(id, evalId, "ai", r.html);
  return NextResponse.json({ ok: true, method, firstName, ...r });
}
