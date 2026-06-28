import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { desc, sql } from "drizzle-orm";

// Spend summed from the per-eval cost columns. Every eval — single
// (/api/eval), re-score (/api/rescore), and bulk (cron) — flows through
// runEval/reEvaluate, which now record the REAL cost from the source response
// (LLM = Vercel gateway per-generation cost; Exa = response costDollars). So
// these sums are the running total of real spend, and each new job increments
// them. Pre-instrumentation rows have NULL cost columns and are simply excluded.

export type RecordedSpend = {
  llmCents: number;
  exaCents: number;
  totalCents: number;
  trackedEvals: number;
  // null window = all time.
  days: number | null;
};

export async function getRecordedSpend(days?: number): Promise<RecordedSpend> {
  const base = db
    .select({
      llm: sql<number>`COALESCE(SUM(${evaluations.costLlmCents}), 0)`,
      exa: sql<number>`COALESCE(SUM(${evaluations.costExaCents}), 0)`,
      total: sql<number>`COALESCE(SUM(${evaluations.costTotalCents}), 0)`,
      tracked: sql<number>`COUNT(*) FILTER (WHERE ${evaluations.costTotalCents} IS NOT NULL)`,
    })
    .from(evaluations);

  const [row] =
    days != null
      ? await base.where(sql`${evaluations.createdAt} >= NOW() - make_interval(days => ${days})`)
      : await base;

  return {
    llmCents: Number(row?.llm ?? 0),
    exaCents: Number(row?.exa ?? 0),
    totalCents: Number(row?.total ?? 0),
    trackedEvals: Number(row?.tracked ?? 0),
    days: days ?? null,
  };
}

export type EvalCostRow = {
  id: string;
  fullName: string | null;
  createdAt: Date;
  llmCents: number | null;
  exaCents: number | null;
  totalCents: number | null;
  model: string | null;
  llmSource: string | null; // "gateway" | "estimated"
};

// Per-eval cost rows for the spend drill-down — most RECENT first (the table is
// then click-sortable on any column in the client). Only rows with a recorded
// cost are returned.
export async function listEvalCosts(limit = 500): Promise<EvalCostRow[]> {
  const rows = await db
    .select({
      id: evaluations.id,
      fullName: evaluations.fullName,
      createdAt: evaluations.createdAt,
      llmCents: evaluations.costLlmCents,
      exaCents: evaluations.costExaCents,
      totalCents: evaluations.costTotalCents,
      model: sql<string | null>`${evaluations.pricing} -> 'llm' ->> 'model'`,
      llmSource: sql<string | null>`${evaluations.pricing} -> 'llm' ->> 'costSource'`,
    })
    .from(evaluations)
    .where(sql`${evaluations.costTotalCents} IS NOT NULL`)
    .orderBy(desc(evaluations.createdAt))
    .limit(limit);
  return rows;
}
