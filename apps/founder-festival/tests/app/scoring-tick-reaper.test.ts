import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { scoringJobs, scoringJobItems } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { reapStuckScoringItems, finalizeCompletedJob } from "@/app/api/cron/scoring-tick/route";
import { IS_PROD_DB } from "../setup";

// A killed tick (300s timeout, deploy, OOM) leaves items flipped to 'scoring'
// that the claim query (pending/resolved only) never reclaims — orphaning them
// forever, which keeps the parent job 'running' and the admin "SCORING…" chip
// lit. reapStuckScoringItems fails those zombies so the job can finalize.

async function seedRunningJobWithItem(
  startedMinutesAgo: number,
  status: "scoring" | "resolving" = "scoring",
  jobStatus: "running" | "queued" | "completed" = "running",
) {
  const [job] = await db
    .insert(scoringJobs)
    .values({ model: "test-model", status: jobStatus, totalItems: 1, failedItems: 0 })
    .returning();
  const [item] = await db
    .insert(scoringJobItems)
    .values({
      jobId: job.id,
      inputRaw: "stuck input",
      status,
      startedAt: sql`NOW() - make_interval(mins => ${startedMinutesAgo})`,
    })
    .returning();
  return { jobId: job.id, itemId: item.id };
}

describe.skipIf(IS_PROD_DB)("reapStuckScoringItems", () => {
  it("fails a long-stuck 'scoring' item and lets the job finalize", async () => {
    const { jobId, itemId } = await seedRunningJobWithItem(30);

    const reaped = await reapStuckScoringItems();
    expect(reaped).toContain(jobId);

    const [item] = await db
      .select()
      .from(scoringJobItems)
      .where(eq(scoringJobItems.id, itemId))
      .limit(1);
    expect(item.status).toBe("failed");
    expect(item.error).toMatch(/timed out/i);

    const [job] = await db.select().from(scoringJobs).where(eq(scoringJobs.id, jobId)).limit(1);
    expect(job.failedItems).toBe(1);

    // With its only item now terminal, the job finalizes.
    const res = await finalizeCompletedJob(jobId);
    expect(res.transitioned).toBe(true);
    const [done] = await db.select().from(scoringJobs).where(eq(scoringJobs.id, jobId)).limit(1);
    expect(done.status).toBe("completed");
  });

  it("also reaps a long-stuck 'resolving' item", async () => {
    const { jobId, itemId } = await seedRunningJobWithItem(30, "resolving");

    const reaped = await reapStuckScoringItems();
    expect(reaped).toContain(jobId);

    const [item] = await db
      .select()
      .from(scoringJobItems)
      .where(eq(scoringJobItems.id, itemId))
      .limit(1);
    expect(item.status).toBe("failed");
  });

  it("does NOT reap an item still within the timeout window", async () => {
    // 2 min < 15 min threshold → a still-alive overlapping tick may own it.
    const { jobId, itemId } = await seedRunningJobWithItem(2);

    const reaped = await reapStuckScoringItems();
    expect(reaped).not.toContain(jobId);

    const [item] = await db
      .select()
      .from(scoringJobItems)
      .where(eq(scoringJobItems.id, itemId))
      .limit(1);
    expect(item.status).toBe("scoring");
  });

  it("does NOT reap an item under an already-terminal job", async () => {
    // Mirrors the claim query's job-status guard: a stuck item under a job that
    // is no longer queued/running must be left alone so finalizeCompletedJob
    // can't drag a terminal job to 'completed' and double-settle its hold.
    const { jobId, itemId } = await seedRunningJobWithItem(30, "scoring", "completed");

    const reaped = await reapStuckScoringItems();
    expect(reaped).not.toContain(jobId);

    const [item] = await db
      .select()
      .from(scoringJobItems)
      .where(eq(scoringJobItems.id, itemId))
      .limit(1);
    expect(item.status).toBe("scoring");
  });
});
