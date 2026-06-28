import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/db";
import { evaluations, scoringJobs, scoringJobItems } from "@/db/schema";
import { eq } from "drizzle-orm";

// Reproduces the delete-profile bug: scoring_job_items.evaluation_id references
// evaluations.id with NO on-delete behavior, so deleting an evaluation that a
// batch scoring job touched throws an FK violation. In /api/account/delete that
// abort leaves the evaluation row behind (the user's claim rows are already
// gone), so the next scoring run serves the stale eval as a cache hit.
describe("scoring_job_items → evaluations FK on delete", () => {
  const LINKEDIN = "https://linkedin.com/in/cascade-fk-test";
  let evalId: string | null = null;
  let jobId: string | null = null;

  afterEach(async () => {
    // Delete the job first — it cascades to its items via job_id — so cleanup
    // works regardless of whether the eval delete under test succeeded.
    if (jobId) await db.delete(scoringJobs).where(eq(scoringJobs.id, jobId));
    if (evalId) await db.delete(evaluations).where(eq(evaluations.id, evalId));
    evalId = null;
    jobId = null;
  });

  it("deleting an evaluation referenced by a scoring_job_item cascades", async () => {
    const [ev] = await db
      .insert(evaluations)
      .values({ linkedinUrl: LINKEDIN, score: 10, signalQuality: "high", source: "test" })
      .returning({ id: evaluations.id });
    evalId = ev!.id;

    const [job] = await db
      .insert(scoringJobs)
      .values({ model: "opus", totalItems: 1 })
      .returning({ id: scoringJobs.id });
    jobId = job!.id;

    await db.insert(scoringJobItems).values({
      jobId: job!.id,
      inputRaw: "Cascade Test",
      evaluationId: ev!.id,
    });

    // Before the fix this throws an FK violation; after, it cascades.
    await db.delete(evaluations).where(eq(evaluations.id, ev!.id));
    evalId = null;

    const remaining = await db
      .select({ id: scoringJobItems.id })
      .from(scoringJobItems)
      .where(eq(scoringJobItems.jobId, job!.id));
    expect(remaining).toHaveLength(0);
  });
});
