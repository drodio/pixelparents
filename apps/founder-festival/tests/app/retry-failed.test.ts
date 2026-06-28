import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { scoringJobs, scoringJobItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { IS_PROD_DB } from "../setup";

// Grant gate is toggled per-test. canAccessJob (RBAC scope) is stubbed true so the
// test focuses on the retry behavior. currentUser is mocked (no real Clerk in node).
let mockAllowed = true;
vi.mock("@/lib/grants", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/grants")>();
  return {
    ...actual,
    requireGrant: vi.fn(async () => {
      if (!mockAllowed) throw Object.assign(new Error("Forbidden"), { status: 403 });
    }),
  };
});
vi.mock("@/lib/ownership", () => ({ canAccessJob: vi.fn(async () => true) }));
vi.mock("@clerk/nextjs/server", () => ({
  currentUser: vi.fn(async () => ({
    id: "u_admin",
    emailAddresses: [{ emailAddress: "admin@test.dev" }],
  })),
}));

import { POST } from "@/app/api/admin/jobs/[id]/retry-failed/route";

const jobIds: string[] = [];

function post(id: string) {
  return POST(new Request(`http://localhost/api/admin/jobs/${id}/retry-failed`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  mockAllowed = true;
});

afterEach(async () => {
  // Deleting the job cascades its scoring_job_items.
  for (const id of jobIds.splice(0)) {
    await db.delete(scoringJobs).where(eq(scoringJobs.id, id));
  }
});

describe.skipIf(IS_PROD_DB)("POST /api/admin/jobs/[id]/retry-failed", () => {
  it("resets failed items to claimable + re-queues the job (failed only)", async () => {
    const [job] = await db
      .insert(scoringJobs)
      .values({
        model: "sonnet",
        totalItems: 3,
        status: "completed",
        completedItems: 1,
        failedItems: 2,
        estimatedCents: 30,
        createdByEmail: "admin@test.dev",
      })
      .returning();
    jobIds.push(job.id);
    await db.insert(scoringJobItems).values([
      { jobId: job.id, inputRaw: "ok", status: "done" },
      { jobId: job.id, inputRaw: "bad1", status: "failed", error: "boom", linkedinUrl: "https://www.linkedin.com/in/x" },
      { jobId: job.id, inputRaw: "bad2", status: "failed", error: "boom2" }, // no linkedinUrl
      { jobId: job.id, inputRaw: "dupe", status: "skipped", error: "duplicate" }, // left alone
    ]);

    const res = await post(job.id);
    expect(res.status).toBe(200);
    expect((await res.json()).retried).toBe(2);

    const items = await db.select().from(scoringJobItems).where(eq(scoringJobItems.jobId, job.id));
    const byInput = new Map(items.map((i) => [i.inputRaw, i]));
    expect(byInput.get("ok")!.status).toBe("done"); // success untouched
    expect(byInput.get("bad1")!.status).toBe("resolved"); // had a URL → skip re-resolve
    expect(byInput.get("bad1")!.error).toBeNull();
    expect(byInput.get("bad1")!.completedAt).toBeNull();
    expect(byInput.get("bad2")!.status).toBe("pending"); // no URL → re-resolve
    expect(byInput.get("dupe")!.status).toBe("skipped"); // skipped left alone

    const [j] = await db.select().from(scoringJobs).where(eq(scoringJobs.id, job.id));
    expect(j.status).toBe("queued");
    expect(j.completedAt).toBeNull();
    expect(j.failedItems).toBe(0); // 2 - 2 reset
  });

  it("400 when the run has no failed items", async () => {
    const [job] = await db
      .insert(scoringJobs)
      .values({ model: "sonnet", totalItems: 1, status: "completed", completedItems: 1, failedItems: 0 })
      .returning();
    jobIds.push(job.id);
    await db.insert(scoringJobItems).values({ jobId: job.id, inputRaw: "ok", status: "done" });

    const res = await post(job.id);
    expect(res.status).toBe(400);
  });

  it("403 without the run_scoring_jobs grant", async () => {
    mockAllowed = false;
    const res = await post("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(403);
  });
});
