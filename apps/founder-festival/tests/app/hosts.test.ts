import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { events, eventAttendees, evaluations, hosts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createHost, setEventHosts, getHostsForEvent, getHostStats } from "@/lib/hosts";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

async function seedEvent() {
  const [e] = await db
    .insert(events)
    .values({ slug: "host-" + rnd(), title: "Host Test", startsAt: new Date("2026-06-01"), status: "open", criteria: {}, source: "luma", lumaEventId: "evt-h-" + rnd() })
    .returning();
  return e;
}

async function seedScored(founderScore: number, investorScore: number) {
  const [ev] = await db
    .insert(evaluations)
    .values({ linkedinUrl: "https://linkedin.com/in/host-" + rnd(), fullName: "Host Subject", score: founderScore + investorScore, founderScore, investorScore, signalQuality: "high", source: "url" })
    .returning();
  return ev;
}

describe.skipIf(IS_PROD_DB)("hosts lib", () => {
  it("assigns hosts to events and aggregates stats across a host's events", async () => {
    const host = await createHost({ name: "TestHost-" + rnd(), blurb: "b" });
    const e1 = await seedEvent();
    const e2 = await seedEvent();
    await setEventHosts(e1.id, [host.id]);
    await setEventHosts(e2.id, [host.id]);

    const forE1 = await getHostsForEvent(e1.id);
    expect(forE1.map((h) => h.id)).toContain(host.id);

    // attendees across both events
    const f = await seedScored(80, 0);
    const i = await seedScored(0, 60);
    await db.insert(eventAttendees).values([
      { eventId: e1.id, evaluationId: f.id, lumaGuestApiId: "gst-" + rnd(), approvalStatus: "approved" },
      { eventId: e2.id, evaluationId: i.id, lumaGuestApiId: "gst-" + rnd(), approvalStatus: "approved" },
    ]);

    const hs = await getHostStats(host.id);
    expect(hs.eventCount).toBe(2);
    expect(hs.totalAttendees).toBe(2);
    expect(hs.stats.founderCount).toBe(1);
    expect(hs.stats.investorCount).toBe(1);
    expect(hs.stats.avgFounderScore).toBe(80);
    expect(hs.stats.avgInvestorScore).toBe(60);

    // re-assigning replaces (idempotent)
    await setEventHosts(e1.id, []);
    expect(await getHostsForEvent(e1.id)).toHaveLength(0);

    // cleanup
    await db.delete(events).where(eq(events.id, e1.id));
    await db.delete(events).where(eq(events.id, e2.id));
    await db.delete(evaluations).where(eq(evaluations.id, f.id));
    await db.delete(evaluations).where(eq(evaluations.id, i.id));
    await db.delete(hosts).where(eq(hosts.id, host.id));
  });
});
