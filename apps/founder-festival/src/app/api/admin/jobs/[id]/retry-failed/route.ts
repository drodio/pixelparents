import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { scoringJobs, scoringJobItems } from "@/db/schema";
import { requireGrant } from "@/lib/grants";
import { canAccessJob } from "@/lib/ownership";
import { holdCreditsForJob } from "@/lib/job-credit-hold";
import { isUuid } from "@/lib/canonicalize";

export const dynamic = "force-dynamic";

// Re-run ONLY the failed items of a run, IN PLACE (vs. POST /api/admin/jobs/[id],
// which clones the whole run). Resets each `failed` item to a claimable status —
// `resolved` if it already has a LinkedIn URL (skip re-resolution), else `pending`
// — clears its error/timestamps, and re-opens the job to `queued` so the worker
// (and the localhost auto-driver) re-attempts them. The run's successful results
// are untouched. The scoring tick re-derives completed/failed counts on the next
// completion; we also adjust `failedItems` here so the UI is correct immediately.
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
  // RBAC scope: a "theirs"-scoped role can only retry its own jobs.
  if (!(await canAccessJob(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const failed = await db
    .select()
    .from(scoringJobItems)
    .where(and(eq(scoringJobItems.jobId, id), eq(scoringJobItems.status, "failed")));
  if (failed.length === 0) {
    return NextResponse.json({ error: "no failed items to re-run" }, { status: 400 });
  }

  // Credit gate (no-op when enforcement is off): hold for the retried items'
  // share of the run estimate, charged to whoever triggered the retry.
  // NOTE (enforcement only): this hold is reconciled against the job's cumulative
  // actualCents on its next completion, so an in-place retry can under-refund
  // slightly (the original items' cost is already counted). Acceptable while
  // enforcement is off; a precise fix needs delta-accounting.
  const perItem =
    job.estimatedCents != null && job.totalItems > 0
      ? Math.round(job.estimatedCents / job.totalItems)
      : null;
  const retryEstimate = perItem != null ? perItem * failed.length : null;
  const actor = await currentUser().catch(() => null);
  const hold = await holdCreditsForJob(actor?.id ?? null, retryEstimate);
  if (hold.kind === "insufficient") {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        balanceCents: hold.balanceCents,
        neededCents: hold.neededCents,
        topupUrl: "/admin/credits",
      },
      { status: 402 },
    );
  }

  // Reset each failed item to a claimable status, clearing its error + timestamps.
  for (const it of failed) {
    await db
      .update(scoringJobItems)
      .set({
        status: it.linkedinUrl ? "resolved" : "pending",
        error: null,
        startedAt: null,
        completedAt: null,
      })
      .where(eq(scoringJobItems.id, it.id));
  }

  // Re-open the job so the tick claims the reset items again.
  await db
    .update(scoringJobs)
    .set({
      status: "queued",
      completedAt: null,
      failedItems: sql`GREATEST(${scoringJobs.failedItems} - ${failed.length}, 0)`,
      ...(hold.creditHoldCents != null ? { creditHoldCents: hold.creditHoldCents } : {}),
    })
    .where(eq(scoringJobs.id, id));

  return NextResponse.json({ retried: failed.length, jobId: id });
}
