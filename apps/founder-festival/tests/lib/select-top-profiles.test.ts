import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/db";
import { evaluations, scoringJobs, scoringJobItems, creditLedger } from "@/db/schema";
import { eq } from "drizzle-orm";
import { selectTopProfiles, TOP_PROFILES_MAX } from "@/lib/profiles-scored";

// Track everything we insert so the afterEach can remove it in FK-safe order.
const evalIds: string[] = [];
const jobIds: string[] = [];
const clerkIds: string[] = [];

afterEach(async () => {
  for (const id of evalIds.splice(0)) {
    await db.delete(creditLedger).where(eq(creditLedger.evaluationId, id));
    await db.delete(evaluations).where(eq(evaluations.id, id));
  }
  for (const id of jobIds.splice(0)) {
    await db.delete(scoringJobs).where(eq(scoringJobs.id, id));
  }
  clerkIds.length = 0;
});

async function seedScored(opts: { score: number }): Promise<string> {
  const [row] = await db
    .insert(evaluations)
    .values({
      linkedinUrl: `https://www.linkedin.com/in/top-${crypto.randomUUID()}`,
      score: opts.score,
      signalQuality: "high",
      source: "url",
      costTotalCents: 40,
    })
    .returning();
  evalIds.push(row.id);
  return row.id;
}

async function markBulk(evalId: string) {
  const [job] = await db
    .insert(scoringJobs)
    .values({ model: "sonnet", totalItems: 1, title: `topN test ${crypto.randomUUID()}` })
    .returning();
  jobIds.push(job.id);
  await db.insert(scoringJobItems).values({
    jobId: job.id,
    inputRaw: "test",
    evaluationId: evalId,
    status: "done",
  });
}

async function markApi(evalId: string) {
  const clerkId = `u_${crypto.randomUUID()}`;
  clerkIds.push(clerkId);
  await db.insert(creditLedger).values({
    clerkUserId: clerkId,
    deltaCents: -250,
    reason: "score_debit",
    evaluationId: evalId,
    balanceAfterCents: 0,
  });
}

describe("selectTopProfiles", () => {
  it("returns up to N highest-scored URL profiles, in score-desc order", async () => {
    const high = await seedScored({ score: 900 });
    const mid = await seedScored({ score: 500 });
    const low = await seedScored({ score: 100 });

    const all = await selectTopProfiles({
      topN: 100,
      sources: ["web", "bulk", "api"],
    });
    const indexOf = (id: string) => all.findIndex((p) => p.id === id);
    // All three present, and ordered high → low.
    expect(indexOf(high)).toBeGreaterThanOrEqual(0);
    expect(indexOf(mid)).toBeGreaterThanOrEqual(0);
    expect(indexOf(low)).toBeGreaterThanOrEqual(0);
    expect(indexOf(high)).toBeLessThan(indexOf(mid));
    expect(indexOf(mid)).toBeLessThan(indexOf(low));
  });

  it("slices to topN AFTER filtering by source (top-N-of-source semantics)", async () => {
    // Seed three webs at high scores and one api also at high score.
    const w1 = await seedScored({ score: 800 });
    const w2 = await seedScored({ score: 700 });
    const w3 = await seedScored({ score: 600 });
    const apiHigh = await seedScored({ score: 900 });
    await markApi(apiHigh);

    // Top 2 web-only: should be w1 + w2, NOT include apiHigh even though
    // apiHigh has the highest score across all sources.
    const got = await selectTopProfiles({ topN: 2, sources: ["web"] });
    const ids = got.map((p) => p.id);
    expect(ids).not.toContain(apiHigh);
    expect(ids[0]).toBe(w1);
    expect(ids[1]).toBe(w2);
    expect(ids).not.toContain(w3); // sliced off after the top 2
  });

  it("returns [] for topN ≤ 0", async () => {
    await seedScored({ score: 500 });
    expect(await selectTopProfiles({ topN: 0, sources: ["web"] })).toEqual([]);
    expect(await selectTopProfiles({ topN: -1, sources: ["web"] })).toEqual([]);
  });

  it("excludes a bulk profile when only api is selected", async () => {
    const bulkId = await seedScored({ score: 300 });
    await markBulk(bulkId);
    const got = await selectTopProfiles({ topN: 100, sources: ["api"] });
    expect(got.map((p) => p.id)).not.toContain(bulkId);
  });

  it("caps topN at TOP_PROFILES_MAX (sanity check on the export)", () => {
    expect(TOP_PROFILES_MAX).toBeGreaterThan(0);
    expect(TOP_PROFILES_MAX).toBeLessThanOrEqual(100_000);
  });
});
