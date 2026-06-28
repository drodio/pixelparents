import { NextResponse } from "next/server";
import { db } from "@/db";
import { scoringJobs, scoringJobItems } from "@/db/schema";
import { isScoringModel, estimateJobCents } from "@/lib/admin";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent, viewerIsUsersScoped } from "@/lib/ownership";
import { holdCreditsForJob } from "@/lib/job-credit-hold";
import { getRescoreableAttendeeProfiles, getEventById } from "@/lib/events";
import { currentUser } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = { model?: string; evaluationId?: string };

// POST /api/admin/events/:id/rescore-attendees — enqueue a re-score for an
// event's matched attendees. Mirrors /api/admin/rescore-all: creates a queued
// scoringJob with one pre-resolved item per eval; the cron drains it. Spends
// credits, so it's gated by run_scoring_jobs (stricter than manage_events).
// Pass { evaluationId } to re-score just that ONE attendee (the per-row button);
// omit it to re-score the whole rescoreable set.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("run_scoring_jobs");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (await viewerIsUsersScoped()) {
    return NextResponse.json({ error: "forbidden_scope" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const model = (body.model ?? "sonnet").toLowerCase();
  if (!isScoringModel(model)) {
    return NextResponse.json({ error: "invalid model" }, { status: 400 });
  }
  const evaluationId = typeof body.evaluationId === "string" ? body.evaluationId : null;

  // Matched, non-removed, approved attendee evals; skip source="code" (manual
  // scores reEvaluate refuses to touch). Shared with the admin button label so
  // the count shown == the count queued.
  let profiles = await getRescoreableAttendeeProfiles(id);

  // Single-attendee re-score (per-row button): narrow to just that eval. If it's
  // not in the rescoreable set (unmatched, removed, or a manual source="code"
  // score), say so rather than silently doing nothing.
  if (evaluationId) {
    profiles = profiles.filter((p) => p.id === evaluationId);
    if (profiles.length === 0) {
      return NextResponse.json({ error: "not_rescoreable" }, { status: 400 });
    }
  }

  if (profiles.length === 0) {
    return NextResponse.json({ jobId: null, count: 0 });
  }

  const event = await getEventById(id);
  const user = await currentUser();
  const createdByEmail = user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? null;

  const estimate = await estimateJobCents(profiles.length, model);
  const hold = await holdCreditsForJob(user?.id ?? null, estimate);
  if (hold.kind === "insufficient") {
    return NextResponse.json(
      { error: "insufficient_credits", balanceCents: hold.balanceCents, neededCents: hold.neededCents, topupUrl: "/admin/credits" },
      { status: 402 },
    );
  }

  const [job] = await db
    .insert(scoringJobs)
    .values({
      title: evaluationId
        ? `Re-score attendee — ${profiles[0]!.fullName ?? profiles[0]!.linkedinUrl} (${event?.title ?? id})`
        : `Re-score event attendees — ${event?.title ?? id}`,
      model,
      status: "queued",
      totalItems: profiles.length,
      estimatedCents: estimate,
      createdByEmail,
      createdByClerkUserId: user?.id ?? null,
      creditHoldCents: hold.creditHoldCents,
    })
    .returning();

  // Each item carries evaluationId → the worker calls reEvaluate (fresh
  // in-place re-score) rather than runEval (URL cache hit). status "resolved"
  // skips handle-resolution and goes straight to scoring. inputRaw is NOT NULL
  // in the schema; linkedin_url is always present (NOT NULL on evaluations).
  const rows = profiles.map((p) => ({
    jobId: job!.id,
    inputRaw: p.fullName ?? p.linkedinUrl,
    linkedinUrl: p.linkedinUrl,
    evaluationId: p.id,
    status: "resolved" as const,
  }));

  // Chunk inserts so a large corpus stays well under the neon-http param cap.
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(scoringJobItems).values(rows.slice(i, i + CHUNK));
  }

  return NextResponse.json({ jobId: job!.id, count: profiles.length, estimatedCents: job!.estimatedCents });
}
