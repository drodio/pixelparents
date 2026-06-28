import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { events, evaluations, eventAttendees } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isEventAttendee } from "@/lib/attendee";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

describe.skipIf(IS_PROD_DB)("isEventAttendee", () => {
  it("true only for an approved, matched attendee of the event", async () => {
    const [event] = await db
      .insert(events)
      .values({ slug: "gate-" + rnd(), title: "Gate", startsAt: new Date("2026-06-01"), status: "open", criteria: {}, source: "luma", lumaEventId: "evt-g-" + rnd() })
      .returning();
    const [ev] = await db
      .insert(evaluations)
      .values({ linkedinUrl: "https://linkedin.com/in/gate-" + rnd(), fullName: "G", score: 50, founderScore: 50, investorScore: 0, signalQuality: "high", source: "url" })
      .returning();

    // not yet an attendee
    expect(await isEventAttendee(event.id, ev.id)).toBe(false);
    expect(await isEventAttendee(event.id, null)).toBe(false);

    // pending RSVP → still false
    await db.insert(eventAttendees).values({ eventId: event.id, evaluationId: ev.id, lumaGuestApiId: "gst-" + rnd(), approvalStatus: "pending" });
    expect(await isEventAttendee(event.id, ev.id)).toBe(false);

    // approved → true
    await db.update(eventAttendees).set({ approvalStatus: "approved" }).where(eq(eventAttendees.evaluationId, ev.id));
    expect(await isEventAttendee(event.id, ev.id)).toBe(true);

    await db.delete(events).where(eq(events.id, event.id));
    await db.delete(evaluations).where(eq(evaluations.id, ev.id));
  }, 20000);
});
