import { describe, it, expect, vi } from "vitest";
import { db } from "@/db";
import { events, eventAttendees, evaluations, scoringJobItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

// The route is grant-gated + credit-held; stub those so the test exercises the
// selection + enqueue logic (the part this feature owns).
vi.mock("@/lib/grants", () => ({ requireGrant: vi.fn(async () => {}) }));
vi.mock("@/lib/ownership", () => ({
  canAccessEvent: vi.fn(async () => true),
  viewerIsUsersScoped: vi.fn(async () => false),
}));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn(async () => null) }));
vi.mock("@/lib/job-credit-hold", () => ({
  holdCreditsForJob: vi.fn(async () => ({ kind: "ok", creditHoldCents: 0 })),
}));

describe.skipIf(IS_PROD_DB)("POST rescore-attendees", () => {
  it("enqueues one job item per matched, url-sourced attendee", async () => {
    const { POST } = await import(
      "@/app/api/admin/events/[id]/rescore-attendees/route"
    );

    const [event] = await db
      .insert(events)
      .values({
        slug: "rsc-" + rnd(),
        title: "Rescore Test",
        startsAt: new Date("2026-06-01"),
        status: "open",
        criteria: {},
        source: "luma",
      })
      .returning();

    const [ev] = await db
      .insert(evaluations)
      .values({
        linkedinUrl: "https://linkedin.com/in/rsc-" + rnd(),
        fullName: "Rescore Person",
        score: 50,
        founderScore: 50,
        investorScore: 0,
        signalQuality: "high",
        source: "url",
      })
      .returning();

    await db.insert(eventAttendees).values({
      eventId: event!.id,
      evaluationId: ev!.id,
      lumaGuestApiId: "gst-" + rnd(),
      name: "Rescore Person",
      approvalStatus: "approved",
      source: "luma",
    });

    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id: event!.id }),
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.count).toBe(1);
    expect(json.jobId).toBeTruthy();

    const items = await db
      .select({ evaluationId: scoringJobItems.evaluationId, status: scoringJobItems.status })
      .from(scoringJobItems)
      .where(eq(scoringJobItems.jobId, json.jobId));
    expect(items.length).toBe(1);
    expect(items[0]!.evaluationId).toBe(ev!.id);
    expect(items[0]!.status).toBe("resolved");
  });

  it("returns count 0 when the event has no matched attendees", async () => {
    const { POST } = await import(
      "@/app/api/admin/events/[id]/rescore-attendees/route"
    );

    const [event] = await db
      .insert(events)
      .values({
        slug: "rsc-empty-" + rnd(),
        title: "Rescore Empty Test",
        startsAt: new Date("2026-06-01"),
        status: "open",
        criteria: {},
        source: "luma",
      })
      .returning();

    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id: event!.id }),
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.count).toBe(0);
    expect(json.jobId).toBeNull();
  });
});
