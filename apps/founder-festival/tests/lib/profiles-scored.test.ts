import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/db";
import {
  evaluations,
  scoringJobs,
  scoringJobItems,
  creditLedger,
  users,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { listScoredProfiles, listProfilesForJob } from "@/lib/profiles-scored";

// Track everything we insert so afterEach can remove it in FK-safe order.
const evalIds: string[] = [];
const jobIds: string[] = [];
const clerkIds: string[] = [];

afterEach(async () => {
  // users → evaluations (cascades scoring_job_items) → scoring_jobs → ledger
  for (const id of clerkIds.splice(0)) {
    await db.delete(users).where(eq(users.clerkUserId, id));
  }
  for (const id of evalIds.splice(0)) {
    await db.delete(creditLedger).where(eq(creditLedger.evaluationId, id));
    await db.delete(evaluations).where(eq(evaluations.id, id));
  }
  for (const id of jobIds.splice(0)) {
    await db.delete(scoringJobs).where(eq(scoringJobs.id, id));
  }
});

async function seedEval(opts: {
  requestIp?: string | null;
  costTotalCents?: number | null;
}): Promise<string> {
  const [row] = await db
    .insert(evaluations)
    .values({
      linkedinUrl: `https://www.linkedin.com/in/test-${crypto.randomUUID()}`,
      score: 50,
      signalQuality: "high",
      source: "url",
      requestIp: opts.requestIp ?? null,
      costTotalCents: opts.costTotalCents ?? 40,
    })
    .returning();
  evalIds.push(row.id);
  return row.id;
}

describe("listScoredProfiles", () => {
  it("classifies web/bulk/api and resolves charge + claimer", async () => {
    // web: request_ip set
    const webId = await seedEval({ requestIp: "203.0.113.7", costTotalCents: 41 });
    // bulk: no request_ip, linked to a scoring_job_items row
    const bulkId = await seedEval({ requestIp: null, costTotalCents: 40 });
    const [job] = await db
      .insert(scoringJobs)
      .values({ model: "sonnet", totalItems: 1, title: "7 YC Founders" })
      .returning();
    jobIds.push(job.id);
    await db.insert(scoringJobItems).values({
      jobId: job.id,
      inputRaw: "test",
      evaluationId: bulkId,
      status: "done",
    });
    // api: no request_ip, no job item, but a credit_ledger score_debit charge
    const apiId = await seedEval({ requestIp: null, costTotalCents: 39 });
    const apiClerkId = `u_api_${crypto.randomUUID()}`;
    clerkIds.push(apiClerkId);
    await db.insert(creditLedger).values({
      clerkUserId: apiClerkId,
      deltaCents: -390, // charged $3.90
      reason: "score_debit",
      evaluationId: apiId,
      balanceAfterCents: 0,
    });
    // Claim the web profile (high confidence) by a clerk user.
    const claimerClerkId = `u_claim_${crypto.randomUUID()}`;
    clerkIds.push(claimerClerkId);
    await db.insert(users).values({
      clerkUserId: claimerClerkId,
      evaluationId: webId,
      matchConfidence: "high",
    });

    // The bug case: a web-form score with NO request_ip, no charge, no job item.
    // Used to misclassify as "api"; must now be "web".
    const webNoIpId = await seedEval({ requestIp: null, costTotalCents: 38 });

    const rows = await listScoredProfiles(500);
    const byId = new Map(rows.map((r) => [r.id, r]));

    expect(byId.get(webId)?.source).toBe("web");
    expect(byId.get(bulkId)?.source).toBe("bulk");
    expect(byId.get(apiId)?.source).toBe("api");
    expect(byId.get(webNoIpId)?.source).toBe("web"); // the fix

    expect(byId.get(webId)?.costCents).toBe(41);
    expect(byId.get(webId)?.chargeCents).toBe(0); // web never billed
    expect(byId.get(apiId)?.chargeCents).toBe(390); // API charge surfaced

    expect(byId.get(webId)?.claimerClerkUserId).toBe(claimerClerkId);
    expect(byId.get(bulkId)?.claimerClerkUserId).toBeNull();

    // runs[]: the bulk profile lists its one run (with title); web/api list none.
    expect(byId.get(bulkId)?.runs).toEqual([{ jobId: job.id, title: "7 YC Founders" }]);
    expect(byId.get(webId)?.runs).toEqual([]);
    expect(byId.get(apiId)?.runs).toEqual([]);
  });
});

describe("listProfilesForJob", () => {
  it("returns the run's scored profiles + status + unresolved count", async () => {
    const scoredId = await seedEval({ requestIp: null, costTotalCents: 40 });
    const [job] = await db
      .insert(scoringJobs)
      .values({ model: "sonnet", totalItems: 2, title: "Batch A" })
      .returning();
    jobIds.push(job.id);
    // One item is scored (linked to an eval, status done)...
    await db.insert(scoringJobItems).values({
      jobId: job.id,
      inputRaw: "scored person",
      evaluationId: scoredId,
      status: "done",
    });
    // ...the other is still pending (no evaluation linked yet).
    await db.insert(scoringJobItems).values({
      jobId: job.id,
      inputRaw: "pending person",
      status: "pending",
    });

    const result = await listProfilesForJob(job.id);

    expect(result.job).toEqual({ id: job.id, title: "Batch A", failedItems: 0 });
    expect(result.unresolvedCount).toBe(1); // the pending item has no eval
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe(scoredId);
    expect(result.rows[0].status).toBe("done");
    // Enrichment still applied: the scored row knows it belongs to this run.
    expect(result.rows[0].runs).toEqual([{ jobId: job.id, title: "Batch A" }]);
  });

  it("keeps the most-recent item status when an eval is in multiple items", async () => {
    const scoredId = await seedEval({ requestIp: null, costTotalCents: 40 });
    const [job] = await db
      .insert(scoringJobs)
      .values({ model: "sonnet", totalItems: 2, title: "Re-scored" })
      .returning();
    jobIds.push(job.id);
    // Same eval scored twice in one job: an older failed attempt, then a newer
    // done one. Items are read newest-first, so "done" must win.
    await db.insert(scoringJobItems).values({
      jobId: job.id,
      inputRaw: "first attempt",
      evaluationId: scoredId,
      status: "failed",
      createdAt: new Date("2020-01-01T00:00:00Z"),
    });
    await db.insert(scoringJobItems).values({
      jobId: job.id,
      inputRaw: "second attempt",
      evaluationId: scoredId,
      status: "done",
      createdAt: new Date("2020-06-01T00:00:00Z"),
    });

    const result = await listProfilesForJob(job.id);

    expect(result.unresolvedCount).toBe(0); // both items have an eval
    expect(result.rows).toHaveLength(1); // de-duped to one row
    expect(result.rows[0].status).toBe("done"); // most-recent status kept
  });

  it("returns job:null for an unknown jobId", async () => {
    const result = await listProfilesForJob(crypto.randomUUID());
    expect(result.job).toBeNull();
    expect(result.rows).toEqual([]);
    expect(result.unresolvedCount).toBe(0);
  });
});
