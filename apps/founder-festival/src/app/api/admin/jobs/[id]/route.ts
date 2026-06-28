import { NextResponse } from "next/server";
import { db } from "@/db";
import { scoringJobs, scoringJobItems, evaluations } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { isAdmin } from "@/lib/admin";
import { requireGrant } from "@/lib/grants";
import { canAccessJob } from "@/lib/ownership";
import { holdCreditsForJob } from "@/lib/job-credit-hold";
import { isUuid } from "@/lib/canonicalize";
import { cloneJobItemForRerun } from "@/lib/scoring-job-runs";
import { currentUser } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "invalid job id" }, { status: 400 });
  }

  const [job] = await db.select().from(scoringJobs).where(eq(scoringJobs.id, id)).limit(1);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  // RBAC scope: a "theirs"-scoped role can only read its own jobs.
  if (!(await canAccessJob(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const items = await db
    .select({
      id: scoringJobItems.id,
      inputRaw: scoringJobItems.inputRaw,
      linkedinUrl: scoringJobItems.linkedinUrl,
      evaluationId: scoringJobItems.evaluationId,
      status: scoringJobItems.status,
      error: scoringJobItems.error,
      startedAt: scoringJobItems.startedAt,
      completedAt: scoringJobItems.completedAt,
      // Per-run snapshot (this run's own numbers); falls back to the live eval
      // below for legacy rows with no snapshot.
      itemFounderScore: scoringJobItems.founderScore,
      itemInvestorScore: scoringJobItems.investorScore,
      itemCombinedScore: scoringJobItems.combinedScore,
      itemCostCents: scoringJobItems.costCents,
      evalScore: evaluations.score,
      evalFounderScore: evaluations.founderScore,
      evalInvestorScore: evaluations.investorScore,
      evalFullName: evaluations.fullName,
      evalLlmCents: evaluations.costLlmCents,
      evalExaCents: evaluations.costExaCents,
      evalTotalCents: evaluations.costTotalCents,
    })
    .from(scoringJobItems)
    .leftJoin(evaluations, eq(evaluations.id, scoringJobItems.evaluationId))
    .where(eq(scoringJobItems.jobId, id))
    .orderBy(asc(scoringJobItems.createdAt));

  return NextResponse.json({ job, items });
}

// Re-run a job: CLONE it into a new run (the original stays intact as history)
// rather than resetting it in place. The new job links back via rerun_of_job_id
// and re-scores the same subjects (items carry evaluationId → reEvaluate in
// place). Before cloning, freeze the source run by backfilling score/cost
// snapshots on any of its items that don't have them yet (older runs), reading
// the current eval BEFORE the new run overwrites it.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("run_scoring_jobs");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "invalid job id" }, { status: 400 });
  }

  const [job] = await db.select().from(scoringJobs).where(eq(scoringJobs.id, id)).limit(1);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  // RBAC scope: a "theirs"-scoped role can only re-run its own jobs.
  if (!(await canAccessJob(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const srcItems = await db
    .select()
    .from(scoringJobItems)
    .where(eq(scoringJobItems.jobId, id))
    .orderBy(asc(scoringJobItems.createdAt));
  if (srcItems.length === 0) {
    return NextResponse.json({ error: "no items to re-run" }, { status: 400 });
  }

  // Freeze the original run: snapshot current eval scores onto source items
  // that lack a snapshot, so they keep their numbers once the new run overwrites
  // the evals.
  for (const it of srcItems) {
    if (it.combinedScore != null || !it.evaluationId) continue;
    const [ev] = await db
      .select({
        f: evaluations.founderScore,
        i: evaluations.investorScore,
        c: evaluations.score,
        cost: evaluations.costTotalCents,
      })
      .from(evaluations)
      .where(eq(evaluations.id, it.evaluationId))
      .limit(1);
    if (ev) {
      await db
        .update(scoringJobItems)
        .set({ founderScore: ev.f, investorScore: ev.i, combinedScore: ev.c, costCents: ev.cost ?? null })
        .where(eq(scoringJobItems.id, it.id));
    }
  }

  // A re-run scores again (real spend), so it gets its own credit hold under
  // enforcement — charged to whoever triggered the re-run (the current viewer),
  // not the original job's creator. No-op when enforcement is off.
  const actor = await currentUser().catch(() => null);
  const hold = await holdCreditsForJob(actor?.id ?? null, job.estimatedCents);
  if (hold.kind === "insufficient") {
    return NextResponse.json(
      { error: "insufficient_credits", balanceCents: hold.balanceCents, neededCents: hold.neededCents, topupUrl: "/admin/credits" },
      { status: 402 },
    );
  }

  const [newJob] = await db
    .insert(scoringJobs)
    .values({
      title: job.title,
      model: job.model,
      status: "queued",
      totalItems: srcItems.length,
      estimatedCents: job.estimatedCents,
      createdByEmail: job.createdByEmail,
      createdByClerkUserId: actor?.id ?? null,
      creditHoldCents: hold.creditHoldCents,
      rerunOfJobId: job.id,
    })
    .returning();

  await db.insert(scoringJobItems).values(
    srcItems.map((it) => ({
      ...cloneJobItemForRerun(it),
      jobId: newJob!.id,
      // Carry the eval link so the worker reEvaluates (re-scores in place)
      // instead of hitting the URL cache.
      evaluationId: it.evaluationId,
    })),
  );

  return NextResponse.json({ jobId: newJob!.id, totalItems: srcItems.length });
}

// Rename a list (job title). run_scoring_jobs grant + own-job scope. Empty title
// clears it back to "Untitled run".
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("run_scoring_jobs");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "invalid job id" }, { status: 400 });
  }
  if (!(await canAccessJob(id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { title?: unknown } = {};
  try {
    body = (await req.json()) as { title?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const [updated] = await db
    .update(scoringJobs)
    .set({ title: title || null })
    .where(eq(scoringJobs.id, id))
    .returning({ id: scoringJobs.id, title: scoringJobs.title });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ title: updated.title });
}
