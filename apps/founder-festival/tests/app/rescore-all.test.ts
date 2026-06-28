import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { scoringJobs, scoringJobItems, evaluations } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { IS_PROD_DB } from "../setup";

// Grant state is toggled per-test via mockAllowed. estimateJobCents is mocked to
// a fixed per-item rate so assertions don't depend on the DB-tuned median.
// isScoringModel is kept real (importActual) so model validation behaves like
// production. The route still imports estimateJobCents + isScoringModel from
// @/lib/admin, so that mock stays; the gate now lives in @/lib/grants.
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
vi.mock("@/lib/admin", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/admin")>();
  return {
    ...actual,
    estimateJobCents: vi.fn(async (n: number) => n * 13),
  };
});

// currentUser is fully mocked (don't load the real Clerk module in node env).
vi.mock("@clerk/nextjs/server", () => ({
  currentUser: vi.fn(async () => ({
    emailAddresses: [{ emailAddress: "admin@test.dev" }],
  })),
}));

import { POST } from "@/app/api/admin/rescore-all/route";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/admin/rescore-all", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

// IDs of jobs created during a test, drained in afterEach so the cleanup runs
// even when an assertion mid-test throws. Without this an orphaned "Re-score
// all profiles" job is left in the DB and shows up in /admin/profiles.
const jobIds: string[] = [];

beforeEach(() => {
  mockAllowed = true;
});

afterEach(async () => {
  // FK scoring_job_items.job_id ON DELETE CASCADE handles the items.
  const ids = jobIds.splice(0);
  if (ids.length > 0) {
    await db.delete(scoringJobs).where(inArray(scoringJobs.id, ids));
  }
});

describe.skipIf(IS_PROD_DB)("POST /api/admin/rescore-all", () => {
  it("creates a queued job with one resolved item per source=url profile", async () => {
    const expected = await db
      .select({ id: evaluations.id })
      .from(evaluations)
      .where(eq(evaluations.source, "url"));
    expect(expected.length).toBeGreaterThan(0); // suite-shared DB always has url evals

    const res = await post({ model: "sonnet" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jobId).toBeTruthy();
    if (json.jobId) jobIds.push(json.jobId); // track for afterEach cleanup
    expect(json.count).toBe(expected.length);

    const [job] = await db
      .select()
      .from(scoringJobs)
      .where(eq(scoringJobs.id, json.jobId));
    expect(job.status).toBe("queued");
    expect(job.model).toBe("sonnet");
    expect(job.totalItems).toBe(expected.length);

    const items = await db
      .select()
      .from(scoringJobItems)
      .where(eq(scoringJobItems.jobId, json.jobId));
    expect(items.length).toBe(expected.length);
    expect(items.every((it) => it.status === "resolved")).toBe(true);
    expect(items.every((it) => it.evaluationId != null)).toBe(true);
  });

  it("returns 403 when not an admin (and creates no job)", async () => {
    mockAllowed = false;
    const before = (await db.select({ id: scoringJobs.id }).from(scoringJobs)).length;
    const res = await post({ model: "sonnet" });
    expect(res.status).toBe(403);
    const after = (await db.select({ id: scoringJobs.id }).from(scoringJobs)).length;
    expect(after).toBe(before);
  });

  it("returns 400 on an invalid model", async () => {
    const res = await post({ model: "gpt-5" });
    expect(res.status).toBe(400);
  });
});
