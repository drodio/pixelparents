import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sweepBdAsync } from "@/lib/bd-async";
import { reEvaluate } from "@/lib/eval-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Advances the async BrightData enrichment queue across all datasets (Crunchbase
// company/person, LinkedIn company, …): for each evaluation with an in-flight
// collection, checks the snapshot; when ready + corroborated, caches the facts,
// queues any newly-unlocked (chained) dataset, and re-scores so the facts fold into
// the breakdown (capped per run — re-scores are expensive). Idempotent + safe on a
// schedule.
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await sweepBdAsync({
    rescore: async (id) => {
      await reEvaluate(id);
    },
  });
  return NextResponse.json({ ok: true, ...result });
}
