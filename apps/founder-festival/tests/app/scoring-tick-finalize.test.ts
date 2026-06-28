import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { scoringJobs, scoringJobItems, creditBalances, creditLedger } from "@/db/schema";
import { eq } from "drizzle-orm";
import { finalizeCompletedJob } from "@/app/api/cron/scoring-tick/route";
import { getBalanceCents } from "@/lib/credits";
import { IS_PROD_DB } from "../setup";

// P0-4: the per-job completion block read job status, unconditionally flipped it
// to 'completed', then refunded the credit hold based on the STALE pre-update
// read. Two overlapping ticks both read 'running' and both refunded the same
// hold. finalizeCompletedJob gates the refund on winning an atomic
// compare-and-set (UPDATE ... WHERE status <> 'completed' RETURNING), so exactly
// one caller ever refunds a given hold.

async function seedDoneJobWithHold(holdCents: number) {
  const clerkUserId = "user_finalize_" + Math.random().toString(36).slice(2, 10);
  await db.insert(creditBalances).values({ clerkUserId, balanceCents: 0 });
  const [job] = await db
    .insert(scoringJobs)
    .values({
      model: "test-model",
      status: "running",
      totalItems: 1,
      estimatedCents: 100,
      actualCents: 0, // actual=0 with estimate=100 => reconcileHold refunds the whole hold
      creditHoldCents: holdCents,
      createdByClerkUserId: clerkUserId,
    })
    .returning();
  await db.insert(scoringJobItems).values({
    jobId: job.id,
    inputRaw: "test input",
    status: "done",
  });
  return { clerkUserId, jobId: job.id };
}

describe.skipIf(IS_PROD_DB)("finalizeCompletedJob", () => {
  it("transitions a fully-done job and refunds the hold exactly once", async () => {
    const { clerkUserId, jobId } = await seedDoneJobWithHold(1000);

    const first = await finalizeCompletedJob(jobId);
    expect(first).toEqual({ transitioned: true, refundedCents: 1000 });
    expect(await getBalanceCents(clerkUserId)).toBe(1000);

    const [job] = await db.select().from(scoringJobs).where(eq(scoringJobs.id, jobId)).limit(1);
    expect(job.status).toBe("completed");
    expect(job.creditHoldCents).toBe(0);
  });

  it("is idempotent: a second finalize never double-refunds", async () => {
    const { clerkUserId, jobId } = await seedDoneJobWithHold(1000);

    await finalizeCompletedJob(jobId);
    const second = await finalizeCompletedJob(jobId);

    expect(second).toEqual({ transitioned: false, refundedCents: 0 });
    expect(await getBalanceCents(clerkUserId)).toBe(1000); // not 2000

    const refunds = await db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.clerkUserId, clerkUserId));
    expect(refunds.filter((r) => r.reason === "refund")).toHaveLength(1);
  });

  it("does not transition or refund while items are still pending", async () => {
    const { clerkUserId, jobId } = await seedDoneJobWithHold(1000);
    // Add a still-pending item so the job is not yet complete.
    await db.insert(scoringJobItems).values({ jobId, inputRaw: "pending one", status: "pending" });

    const res = await finalizeCompletedJob(jobId);
    expect(res).toEqual({ transitioned: false, refundedCents: 0 });
    expect(await getBalanceCents(clerkUserId)).toBe(0);

    const [job] = await db.select().from(scoringJobs).where(eq(scoringJobs.id, jobId)).limit(1);
    expect(job.status).toBe("running");
  });
});
