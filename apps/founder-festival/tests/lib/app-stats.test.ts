import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { appStats } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  AVG_COST_CENTS_KEY,
  refreshAvgCostStat,
  getAvgCostCents,
} from "@/lib/app-stats";

describe("app-stats avg cost", () => {
  // Asserts the storage/read contract, not an exact average. The average is a
  // GLOBAL aggregate over the shared dev DB, which other test files mutate
  // concurrently (e.g. profiles-scored seeds/deletes evals) — so comparing the
  // returned value to a separately-timed AVG query is inherently racy. The
  // round-trip below is race-free: nothing but this test writes app_stats during
  // the suite, so getAvgCostCents() reads back exactly what refresh wrote.
  it("refreshAvgCostStat computes a finite average and stores it for getAvgCostCents to read", async () => {
    const value = await refreshAvgCostStat();
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);

    // Round-trip: the stored value is exactly what refresh returned, under the
    // documented key, readable by getAvgCostCents.
    const [stored] = await db
      .select({ value: appStats.value })
      .from(appStats)
      .where(eq(appStats.key, AVG_COST_CENTS_KEY));
    expect(stored).toBeTruthy();
    expect(Number(stored.value)).toBe(value);
    expect(await getAvgCostCents()).toBe(value);
  });
});
