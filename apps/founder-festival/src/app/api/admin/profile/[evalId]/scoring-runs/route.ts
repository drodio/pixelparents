// GET /api/admin/profile/[evalId]/scoring-runs
//
// Superadmin-only. Returns every scoring run for one evaluation, newest first —
// the data behind the "Scoring Log" table. Each row includes the summary scalar
// columns (for the table) AND the full `snapshot` (so clicking a row can rebuild
// the Score Detail modal with no second fetch).
//
// Returns: { ok: true, runs: ScoringRunDTO[] }

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { scoringRuns } from "@/db/schema";
import { isSuperAdmin } from "@/lib/admin";
import { reportServerError } from "@/lib/report-server-error";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ evalId: string }> },
) {
  // Mirror the profile page's Scoring Log gate (showScoreDetail = isLocalhost ||
  // superAdmin): super-admins on the deployed site, plus anyone on a local dev
  // server (host is never localhost in production). Keeps the localhost dev
  // convenience the old server-rendered Score Detail had.
  const host = req.headers.get("host") ?? "";
  const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  if (!isLocalhost) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    if (!(await isSuperAdmin())) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const { evalId } = await ctx.params;

  try {
    const rows = await db
      .select()
      .from(scoringRuns)
      .where(eq(scoringRuns.evaluationId, evalId))
      .orderBy(desc(scoringRuns.createdAt));

    const runs = rows.map((r) => ({
      id: r.id,
      evaluationId: r.evaluationId,
      createdAt: r.createdAt.toISOString(),
      founderScore: r.founderScore,
      investorScore: r.investorScore,
      score: r.score,
      signalQuality: r.signalQuality,
      companyStage: r.companyStage,
      source: r.source,
      sourceCode: r.sourceCode,
      model: r.model,
      costTotalCents: r.costTotalCents,
      snapshot: r.snapshot,
    }));

    return NextResponse.json({ ok: true, runs });
  } catch (err) {
    await reportServerError(err, {
      route: "GET /api/admin/profile/[evalId]/scoring-runs",
      evalId,
    });
    return NextResponse.json({ error: "scoring_runs_failed" }, { status: 500 });
  }
}
