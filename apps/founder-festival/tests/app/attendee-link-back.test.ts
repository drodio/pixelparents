import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { events, eventAttendees, evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

describe.skipIf(IS_PROD_DB)("linkAttendeesByLinkedin", () => {
  it("sets evaluationId on attendees with the given linkedin_url and null evaluationId", async () => {
    const { linkAttendeesByLinkedin } = await import("@/lib/attendee-scoring");

    // Seed an event.
    const [event] = await db
      .insert(events)
      .values({
        slug: "lnk-" + rnd(),
        title: "Link-back Test",
        startsAt: new Date("2026-07-01"),
        status: "open",
        criteria: {},
        source: "luma",
      })
      .returning();

    // Seed an evaluation that the scoring cron would have just created.
    const linkedinUrl = `https://linkedin.com/in/lnk-${rnd()}`;
    const [ev] = await db
      .insert(evaluations)
      .values({
        linkedinUrl,
        fullName: "Link-back Person",
        score: 70,
        founderScore: 70,
        investorScore: 0,
        signalQuality: "high",
        source: "url",
      })
      .returning();

    // Seed an attendee with the same linkedin_url but no evaluationId yet
    // (the state before the cron links it back).
    const [att] = await db
      .insert(eventAttendees)
      .values({
        eventId: event!.id,
        lumaGuestApiId: "gst-lnk-" + rnd(),
        name: "Link-back Person",
        linkedinUrl,
        evaluationId: null,
        source: "luma",
      })
      .returning();

    // Run the link-back helper.
    await linkAttendeesByLinkedin(linkedinUrl, ev!.id);

    // The attendee should now have the evaluationId set.
    const [updated] = await db
      .select()
      .from(eventAttendees)
      .where(eq(eventAttendees.id, att!.id))
      .limit(1);

    expect(updated!.evaluationId).toBe(ev!.id);
  });

  it("does not overwrite an attendee that already has an evaluationId", async () => {
    const { linkAttendeesByLinkedin } = await import("@/lib/attendee-scoring");

    const [event] = await db
      .insert(events)
      .values({
        slug: "lnk2-" + rnd(),
        title: "Link-back Skip Test",
        startsAt: new Date("2026-07-01"),
        status: "open",
        criteria: {},
        source: "luma",
      })
      .returning();

    const linkedinUrl = `https://linkedin.com/in/lnk2-${rnd()}`;

    // The attendee's existing (original) evaluation.
    const [originalEv] = await db
      .insert(evaluations)
      .values({
        linkedinUrl,
        fullName: "Already Linked",
        score: 60,
        founderScore: 60,
        investorScore: 0,
        signalQuality: "high",
        source: "url",
      })
      .returning();

    // A second evaluation (the one the cron just produced) at a different URL
    // so we can tell if the attendee was incorrectly updated.
    const newLinkedinUrl = `https://linkedin.com/in/lnk2-new-${rnd()}`;
    const [newEv] = await db
      .insert(evaluations)
      .values({
        linkedinUrl: newLinkedinUrl,
        fullName: "New Eval",
        score: 50,
        founderScore: 50,
        investorScore: 0,
        signalQuality: "high",
        source: "url",
      })
      .returning();

    // Attendee already linked to originalEv.
    const [att] = await db
      .insert(eventAttendees)
      .values({
        eventId: event!.id,
        lumaGuestApiId: "gst-lnk2-" + rnd(),
        name: "Already Linked",
        linkedinUrl,
        evaluationId: originalEv!.id, // already set
        source: "luma",
      })
      .returning();

    // linkAttendeesByLinkedin with the same linkedin_url but a new evaluationId
    // should be a no-op because the attendee already has an evaluationId.
    await linkAttendeesByLinkedin(linkedinUrl, newEv!.id);

    const [reread] = await db
      .select()
      .from(eventAttendees)
      .where(eq(eventAttendees.id, att!.id))
      .limit(1);

    // evaluationId must still be the original — not the new one.
    expect(reread!.evaluationId).toBe(originalEv!.id);
  });
});
