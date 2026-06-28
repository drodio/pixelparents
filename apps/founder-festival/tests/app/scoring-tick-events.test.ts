import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { events, eventApplicants, evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { processEventApplicantAutoRule } from "@/app/api/cron/scoring-tick/route";
import { IS_PROD_DB } from "../setup";

async function makeAutoEvent() {
  const [e] = await db.insert(events).values({
    slug: "auto-" + Math.random().toString(36).slice(2, 6),
    title: "Auto Event",
    startsAt: new Date("2026-07-01"),
    status: "open",
    approvalMode: "auto",
    criteria: { side: "founder", founderScoreMin: 50, investorScoreMin: 0, stages: [] },
  }).returning();
  return e;
}

describe.skipIf(IS_PROD_DB)("processEventApplicantAutoRule", () => {
  it("auto-approves a qualifying applicant", async () => {
    const e = await makeAutoEvent();
    const [ev] = await db.insert(evaluations).values({
      linkedinUrl: "https://www.linkedin.com/in/auto-" + Math.random().toString(36).slice(2, 6),
      fullName: "Auto Founder",
      score: 100, founderScore: 100, investorScore: 0,
      signalQuality: "high", source: "url",
    }).returning();
    const [a] = await db.insert(eventApplicants).values({
      eventId: e.id, evaluationId: ev.id, linkedinUrl: ev.linkedinUrl,
      email: "a@b.com", status: "scored",
    }).returning();
    await processEventApplicantAutoRule(a.id);
    const [reread] = await db.select().from(eventApplicants).where(eq(eventApplicants.id, a.id)).limit(1);
    expect(reread.status).toBe("approved");
  });

  it("denies a clearly-below applicant in auto mode", async () => {
    const e = await makeAutoEvent();
    const [ev] = await db.insert(evaluations).values({
      linkedinUrl: "https://www.linkedin.com/in/low-" + Math.random().toString(36).slice(2, 6),
      score: 10, founderScore: 10, investorScore: 0,
      signalQuality: "medium", source: "url",
    }).returning();
    const [a] = await db.insert(eventApplicants).values({
      eventId: e.id, evaluationId: ev.id, linkedinUrl: ev.linkedinUrl,
      email: "a@b.com", status: "scored",
    }).returning();
    await processEventApplicantAutoRule(a.id);
    const [reread] = await db.select().from(eventApplicants).where(eq(eventApplicants.id, a.id)).limit(1);
    expect(reread.status).toBe("denied");
  });

  it("leaves a near-miss in scored status (hybrid review)", async () => {
    const [e] = await db.insert(events).values({
      slug: "hybrid-" + Math.random().toString(36).slice(2, 6),
      title: "Hybrid", startsAt: new Date("2026-07-01"), status: "open", approvalMode: "hybrid",
      criteria: { side: "founder", founderScoreMin: 100, investorScoreMin: 0, stages: [] },
    }).returning();
    const [ev] = await db.insert(evaluations).values({
      linkedinUrl: "https://www.linkedin.com/in/near-" + Math.random().toString(36).slice(2, 6),
      score: 80, founderScore: 80, investorScore: 0,
      signalQuality: "high", source: "url",
    }).returning();
    const [a] = await db.insert(eventApplicants).values({
      eventId: e.id, evaluationId: ev.id, linkedinUrl: ev.linkedinUrl,
      email: "a@b.com", status: "scored",
    }).returning();
    await processEventApplicantAutoRule(a.id);
    const [reread] = await db.select().from(eventApplicants).where(eq(eventApplicants.id, a.id)).limit(1);
    expect(reread.status).toBe("scored");  // queued for admin review
  });
});
