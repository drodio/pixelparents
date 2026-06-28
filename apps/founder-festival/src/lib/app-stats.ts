import { db } from "@/db";
import { appStats, evaluations } from "@/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";

// Stored in app_stats under this key (value is a double = mean cost in cents).
export const AVG_COST_CENTS_KEY = "avg_cost_cents";

// Recompute the mean cost-to-score across all real (source="url") profiles that
// have a recorded cost, and upsert it into app_stats. Returns the value.
// Callers in the scoring path wrap this in .catch() so a stats hiccup never
// fails a score.
export async function refreshAvgCostStat(): Promise<number> {
  const [row] = await db
    .select({ avg: sql<number | null>`avg(${evaluations.costTotalCents})` })
    .from(evaluations)
    .where(and(eq(evaluations.source, "url"), isNotNull(evaluations.costTotalCents)));
  const value = Number(row?.avg ?? 0);
  await db
    .insert(appStats)
    .values({ key: AVG_COST_CENTS_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appStats.key,
      set: { value, updatedAt: new Date() },
    });
  return value;
}

// Read the stored average cost in cents (e.g. 40.27), or null if never computed.
export async function getAvgCostCents(): Promise<number | null> {
  const [row] = await db
    .select({ value: appStats.value })
    .from(appStats)
    .where(eq(appStats.key, AVG_COST_CENTS_KEY))
    .limit(1);
  return row ? Number(row.value) : null;
}
