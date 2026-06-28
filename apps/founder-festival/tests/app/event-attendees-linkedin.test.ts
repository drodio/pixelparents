import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { events, eventAttendees, evaluations, profileEmails } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { LumaGuest } from "@/lib/luma";
import { syncEventAttendees } from "@/lib/event-attendees-sync";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

async function seedEvalWithLinkedin(linkedinUrl: string) {
  const [ev] = await db
    .insert(evaluations)
    .values({
      linkedinUrl,
      fullName: "LinkedIn Match Test",
      score: 70,
      founderScore: 70,
      investorScore: 0,
      signalQuality: "medium",
      source: "url",
    })
    .returning();
  return ev;
}

async function seedEvalWithEmail(email: string) {
  const [ev] = await db
    .insert(evaluations)
    .values({
      linkedinUrl: "https://linkedin.com/in/email-match-" + rnd(),
      fullName: "Email Match Test",
      score: 70,
      founderScore: 70,
      investorScore: 0,
      signalQuality: "medium",
      source: "url",
    })
    .returning();
  await db.insert(profileEmails).values({
    evaluationId: ev.id,
    email,
    status: "verified",
    source: "operator",
  });
  return ev;
}

async function seedLumaEvent(lumaEventId: string) {
  const [e] = await db
    .insert(events)
    .values({
      slug: "linkedin-sync-" + rnd(),
      title: "LinkedIn Sync Test",
      startsAt: new Date("2026-06-01"),
      status: "open",
      criteria: {},
      source: "luma",
      lumaEventId,
      lumaUrl: "https://luma.com/" + lumaEventId,
    })
    .returning();
  return e;
}

describe.skipIf(IS_PROD_DB)("syncEventAttendees — linkedin matching", () => {
  it("matches attendee by linkedin url when email does not match", async () => {
    const handle = "linkedin-test-" + rnd();
    const linkedinUrl = `https://linkedin.com/in/${handle}`;
    const seededEval = await seedEvalWithLinkedin(linkedinUrl);

    const lumaEventId = "evt-li-" + rnd();
    const event = await seedLumaEvent(lumaEventId);

    // Guest has a non-matching email but a matching LinkedIn in registration answers
    const guest: LumaGuest = {
      api_id: "gst-li-" + rnd(),
      approval_status: "approved",
      email: `nomatch-${rnd()}@example.com`, // won't match any profile
      name: "LinkedIn Match Person",
      user_api_id: "usr-" + rnd(),
      registered_at: "2026-06-01T10:00:00.000Z",
      checked_in_at: null,
      registration_answers: [
        {
          label: "What is your LinkedIn profile?",
          question: null,
          answer: `https://www.linkedin.com/in/${handle}/`, // with www + trailing slash
        },
      ],
    };

    const fetchGuests = async (id: string) => (id === lumaEventId ? [guest] : []);

    const res = await syncEventAttendees({ fetchGuests });
    expect(res.attendees).toBeGreaterThanOrEqual(1);
    expect(res.matched).toBeGreaterThanOrEqual(1);

    const rows = await db
      .select()
      .from(eventAttendees)
      .where(eq(eventAttendees.eventId, event.id));

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    // evaluationId should be linked by linkedin match
    expect(row.evaluationId).toBe(seededEval.id);
    // linkedin_url should be stored on the attendee row (canonicalized)
    expect(row.linkedinUrl).toBe(linkedinUrl);

    // Cleanup
    await db.delete(events).where(eq(events.id, event.id));
    await db.delete(evaluations).where(eq(evaluations.id, seededEval.id));
  });

  it("email match takes priority over linkedin match", async () => {
    const matchEmail = `email-priority-${rnd()}@example.com`;
    const handle = "li-secondary-" + rnd();
    const linkedinUrl = `https://linkedin.com/in/${handle}`;

    const emailEval = await seedEvalWithEmail(matchEmail);
    // a separate eval with the same linkedin (shouldn't be matched for this guest)
    const linkedinEval = await seedEvalWithLinkedin(linkedinUrl);

    const lumaEventId = "evt-ep-" + rnd();
    const event = await seedLumaEvent(lumaEventId);

    const guest: LumaGuest = {
      api_id: "gst-ep-" + rnd(),
      approval_status: "approved",
      email: matchEmail,
      name: "Email Priority Person",
      user_api_id: "usr-" + rnd(),
      registered_at: "2026-06-01T10:00:00.000Z",
      checked_in_at: null,
      registration_answers: [
        {
          label: "LinkedIn",
          question: null,
          answer: `https://linkedin.com/in/${handle}`,
        },
      ],
    };

    const fetchGuests = async (id: string) => (id === lumaEventId ? [guest] : []);

    await syncEventAttendees({ fetchGuests });

    const rows = await db
      .select()
      .from(eventAttendees)
      .where(eq(eventAttendees.eventId, event.id));

    expect(rows).toHaveLength(1);
    // Should match by email, not linkedin
    expect(rows[0]!.evaluationId).toBe(emailEval.id);
    expect(rows[0]!.linkedinUrl).toBe(linkedinUrl);

    // Cleanup
    await db.delete(events).where(eq(events.id, event.id));
    await db.delete(evaluations).where(eq(evaluations.id, emailEval.id));
    await db.delete(evaluations).where(eq(evaluations.id, linkedinEval.id));
  });

  it("stores linkedin_url on attendee even when no evaluation match", async () => {
    const handle = "no-match-" + rnd();
    const linkedinUrl = `https://linkedin.com/in/${handle}`;

    const lumaEventId = "evt-nm-" + rnd();
    const event = await seedLumaEvent(lumaEventId);

    const guest: LumaGuest = {
      api_id: "gst-nm-" + rnd(),
      approval_status: "pending",
      email: `nobody-${rnd()}@example.com`,
      name: "No Match Person",
      user_api_id: "usr-" + rnd(),
      registered_at: "2026-06-01T10:00:00.000Z",
      checked_in_at: null,
      registration_answers: [
        { label: "LinkedIn profile?", question: null, answer: `https://linkedin.com/in/${handle}` },
      ],
    };

    const fetchGuests = async (id: string) => (id === lumaEventId ? [guest] : []);

    await syncEventAttendees({ fetchGuests });

    const rows = await db
      .select()
      .from(eventAttendees)
      .where(eq(eventAttendees.eventId, event.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.evaluationId).toBeNull();
    expect(rows[0]!.linkedinUrl).toBe(linkedinUrl);

    // Cleanup
    await db.delete(events).where(eq(events.id, event.id));
  });
});
