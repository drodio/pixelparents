import { NextResponse } from "next/server";
import { db } from "@/db";
import { scoringJobs, scoringJobItems, evaluations } from "@/db/schema";
import { isScoringModel, estimateJobCents } from "@/lib/admin";
import { requireGrant } from "@/lib/grants";
import { viewerIsUsersScoped } from "@/lib/ownership";
import { holdCreditsForJob } from "@/lib/job-credit-hold";
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = { model?: string };

// Re-score every AI-scored profile in one batch. This does NOT score inline
// (that would blow the function time limit) — it creates a queued scoring job
// with one item per profile. The cron worker (prod) / job-page auto-driver
// (localhost) then calls reEvaluate per item, so the bulk run uses the exact
// current per-profile scoring pipeline. SECURITY: grant-gated server-side —
// the `run_scoring_jobs` grant counts only verified emails, so this is the real
// gate (the UI button is just convenience).
export async function POST(req: Request) {
  try {
    await requireGrant("run_scoring_jobs");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // "Re-score all" is inherently cross-tenant — it touches every profile. A
  // "theirs"-scoped role may not run it.
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

  // All AI-scored profiles. source="code" rows are manually-entered scores with
  // no real LinkedIn research behind them — re-scoring would clobber them.
  const profiles = await db
    .select({
      id: evaluations.id,
      linkedinUrl: evaluations.linkedinUrl,
      fullName: evaluations.fullName,
    })
    .from(evaluations)
    .where(eq(evaluations.source, "url"));

  if (profiles.length === 0) {
    return NextResponse.json({ jobId: null, count: 0 });
  }

  const user = await currentUser();
  const createdByEmail =
    user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? null;

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });

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
      title: `Re-score all profiles — ${today}`,
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

  return NextResponse.json({
    jobId: job!.id,
    count: profiles.length,
    estimatedCents: job!.estimatedCents,
  });
}
