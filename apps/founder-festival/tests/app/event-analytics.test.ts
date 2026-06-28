import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { events, eventAttendees, evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getEventAnalytics } from "@/lib/events";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

async function seedScoredEval(founderScore: number, investorScore: number) {
  const [ev] = await db
    .insert(evaluations)
    .values({
      linkedinUrl: "https://linkedin.com/in/analytics-" + rnd(),
      fullName: "Analytics Subject",
      score: founderScore + investorScore,
      founderScore,
      investorScore,
      signalQuality: "high",
      source: "url",
      breakdown: {
        founder: founderScore > 0 ? [{ points: founderScore, reason: "Built and scaled product as technical founder" }] : [],
        investor: investorScore > 0 ? [{ points: investorScore, reason: "Strong portfolio with multiple outcomes" }] : [],
      },
    })
    .returning();
  return ev;
}

describe.skipIf(IS_PROD_DB)("getEventAnalytics", () => {
  it("aggregates approved matched attendees into stats + radars", async () => {
    const [event] = await db
      .insert(events)
      .values({ slug: "analytics-" + rnd(), title: "Analytics Test", startsAt: new Date("2026-06-01"), status: "open", criteria: {}, source: "luma", lumaEventId: "evt-an-" + rnd() })
      .returning();

    const founder = await seedScoredEval(90, 0);
    const investor = await seedScoredEval(0, 70);

    // two approved + matched, plus one approved unmatched (counts toward total only)
    await db.insert(eventAttendees).values([
      { eventId: event.id, evaluationId: founder.id, lumaGuestApiId: "gst-" + rnd(), approvalStatus: "approved" },
      { eventId: event.id, evaluationId: investor.id, lumaGuestApiId: "gst-" + rnd(), approvalStatus: "approved" },
      { eventId: event.id, evaluationId: null, lumaGuestApiId: "gst-" + rnd(), email: "x@y.com", approvalStatus: "approved" },
      { eventId: event.id, evaluationId: null, lumaGuestApiId: "gst-" + rnd(), approvalStatus: "pending" }, // excluded
    ]);

    const a = await getEventAnalytics(event.id);
    expect(a).not.toBeNull();
    expect(a!.totalAttendees).toBe(3); // 3 approved (pending excluded)
    expect(a!.matchedScored).toBe(2);
    expect(a!.stats.founderCount).toBe(1);
    expect(a!.stats.investorCount).toBe(1);
    expect(a!.stats.avgFounderScore).toBe(90);
    expect(a!.stats.avgInvestorScore).toBe(70);
    expect(a!.radars.founder).toHaveLength(5);
    expect(a!.radars.investor).toHaveLength(5);

    // cleanup (event cascade removes attendees)
    await db.delete(events).where(eq(events.id, event.id));
    await db.delete(evaluations).where(eq(evaluations.id, founder.id));
    await db.delete(evaluations).where(eq(evaluations.id, investor.id));
  });

  it("returns null when no approved attendee matched a scored profile", async () => {
    const [event] = await db
      .insert(events)
      .values({ slug: "analytics-empty-" + rnd(), title: "Empty", startsAt: new Date("2026-06-01"), status: "open", criteria: {}, source: "luma", lumaEventId: "evt-an-" + rnd() })
      .returning();
    await db.insert(eventAttendees).values({ eventId: event.id, evaluationId: null, lumaGuestApiId: "gst-" + rnd(), approvalStatus: "approved" });
    const a = await getEventAnalytics(event.id);
    expect(a).toBeNull();
    await db.delete(events).where(eq(events.id, event.id));
  });
});
