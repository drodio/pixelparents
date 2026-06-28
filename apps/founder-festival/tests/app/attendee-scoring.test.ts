import { describe, it, expect, vi, afterEach } from "vitest";
import { db } from "@/db";
import { scoringJobs, scoringJobItems } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

// Mock holdCreditsForJob so credit-enforcement is bypassed in tests.
vi.mock("@/lib/job-credit-hold", () => ({
  holdCreditsForJob: vi.fn(async () => ({ kind: "ok", creditHoldCents: 0 })),
}));

// Mock estimateJobCents to a fixed per-item rate so assertions don't depend
// on the DB-tuned median.
vi.mock("@/lib/admin", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/admin")>();
  return {
    ...actual,
    estimateJobCents: vi.fn(async (n: number) => n * 13),
  };
});

const jobIds: string[] = [];

afterEach(async () => {
  // FK scoring_job_items.job_id ON DELETE CASCADE handles the items.
  const ids = jobIds.splice(0);
  if (ids.length > 0) {
    await db.delete(scoringJobs).where(inArray(scoringJobs.id, ids));
  }
});

describe.skipIf(IS_PROD_DB)("enqueueAttendeeScoring", () => {
  it("creates a queued job with one resolved item per URL", async () => {
    const { enqueueAttendeeScoring } = await import("@/lib/attendee-scoring");

    const urlA = `https://linkedin.com/in/a-${rnd()}`;
    const urlB = `https://linkedin.com/in/b-${rnd()}`;

    const result = await enqueueAttendeeScoring([urlA, urlB], {
      clerkUserId: null,
      createdByEmail: null,
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    jobIds.push(result.jobId);
    expect(result.count).toBe(2);

    const items = await db
      .select()
      .from(scoringJobItems)
      .where(eq(scoringJobItems.jobId, result.jobId));

    expect(items).toHaveLength(2);
    expect(items.every((it) => it.status === "resolved")).toBe(true);
    expect(items.every((it) => it.linkedinUrl != null)).toBe(true);
    expect(items.every((it) => it.evaluationId === null)).toBe(true);

    const urls = items.map((it) => it.linkedinUrl).sort();
    expect(urls).toEqual([urlA, urlB].sort());
  });

  it("deduplicates URLs — two identical URLs enqueue only one item", async () => {
    const { enqueueAttendeeScoring } = await import("@/lib/attendee-scoring");

    const url = `https://linkedin.com/in/dedup-${rnd()}`;

    const result = await enqueueAttendeeScoring([url, url], {
      clerkUserId: null,
      createdByEmail: null,
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    jobIds.push(result.jobId);
    expect(result.count).toBe(1);

    const items = await db
      .select()
      .from(scoringJobItems)
      .where(eq(scoringJobItems.jobId, result.jobId));
    expect(items).toHaveLength(1);
  });

  it("returns kind 'empty' for an empty array", async () => {
    const { enqueueAttendeeScoring } = await import("@/lib/attendee-scoring");

    const result = await enqueueAttendeeScoring([], {
      clerkUserId: null,
      createdByEmail: null,
    });

    expect(result.kind).toBe("empty");
  });

  it("returns kind 'insufficient' when holdCreditsForJob says so", async () => {
    // Override the mock for this test to return insufficient.
    const { holdCreditsForJob } = await import("@/lib/job-credit-hold");
    vi.mocked(holdCreditsForJob).mockResolvedValueOnce({
      kind: "insufficient",
      balanceCents: 50,
      neededCents: 200,
    });

    const { enqueueAttendeeScoring } = await import("@/lib/attendee-scoring");

    const result = await enqueueAttendeeScoring(
      [`https://linkedin.com/in/x-${rnd()}`],
      { clerkUserId: "clerk_test_123", createdByEmail: "test@example.com" },
    );

    expect(result.kind).toBe("insufficient");
    if (result.kind !== "insufficient") return;
    expect(result.balanceCents).toBe(50);
    expect(result.neededCents).toBe(200);
  });
});
