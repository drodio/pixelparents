import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  sendApprovedEmail: vi.fn().mockResolvedValue({ id: "msg1" }),
  sendFutureEventsEmail: vi.fn().mockResolvedValue({ id: "msg2" }),
}));

import { db } from "@/db";
import { events, eventApplicants, eventDecisionLog } from "@/db/schema";
import { transitionApplicant, getEventBySlug, listApplicants } from "@/lib/events";
import { eq } from "drizzle-orm";

async function makeEvent() {
  const [row] = await db.insert(events).values({
    slug: "test-" + Math.random().toString(36).slice(2, 10),
    title: "Test Event",
    startsAt: new Date("2026-07-01"),
    status: "open",
    approvalMode: "manual",
    criteria: { side: "founder", founderScoreMin: 50, investorScoreMin: 0, stages: [] },
  }).returning();
  return row;
}

async function makeApplicant(eventId: string) {
  const [row] = await db.insert(eventApplicants).values({
    eventId,
    linkedinUrl: "https://www.linkedin.com/in/test-" + Math.random().toString(36).slice(2, 10),
    email: "test@example.com",
    status: "scored",
  }).returning();
  return row;
}

describe("events lib", () => {
  it("getEventBySlug returns the event", async () => {
    const e = await makeEvent();
    const found = await getEventBySlug(e.slug);
    expect(found?.id).toBe(e.id);
  });

  it("transitionApplicant writes a decision-log row", async () => {
    const e = await makeEvent();
    const a = await makeApplicant(e.id);
    await transitionApplicant({
      applicantId: a.id,
      toStatus: "approved",
      reason: "manual approve",
      actorEmail: "admin@example.com",
    });
    const [reread] = await db.select().from(eventApplicants).where(eq(eventApplicants.id, a.id)).limit(1);
    expect(reread.status).toBe("approved");
    expect(reread.decidedByEmail).toBe("admin@example.com");
    const logs = await db.select().from(eventDecisionLog).where(eq(eventDecisionLog.applicantId, a.id));
    expect(logs).toHaveLength(1);
    expect(logs[0].fromStatus).toBe("scored");
    expect(logs[0].toStatus).toBe("approved");
  });

  it("transitionApplicant returns an object reflecting the just-applied update", async () => {
    const e = await makeEvent();
    const a = await makeApplicant(e.id);
    const result = await transitionApplicant({
      applicantId: a.id,
      toStatus: "denied",
      reason: "too low",
      actorEmail: "admin@example.com",
    });
    expect(result.status).toBe("denied");
    expect(result.decisionReason).toBe("too low");
    expect(result.decidedByEmail).toBe("admin@example.com");
    expect(result.decidedAt).not.toBeNull();
  });

  it("listApplicants filters by status", async () => {
    const e = await makeEvent();
    const a1 = await makeApplicant(e.id);
    await transitionApplicant({ applicantId: a1.id, toStatus: "approved", reason: "ok", actorEmail: "x" });
    const a2 = await makeApplicant(e.id);
    const scored = await listApplicants({ eventId: e.id, status: "scored" });
    expect(scored.map((r) => r.id)).toContain(a2.id);
    expect(scored.map((r) => r.id)).not.toContain(a1.id);
  });
});
