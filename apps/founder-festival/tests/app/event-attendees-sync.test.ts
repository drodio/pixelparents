import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { events, eventAttendees, evaluations, profileEmails } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { LumaGuest } from "@/lib/luma";
import { syncEventAttendees } from "@/lib/event-attendees-sync";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

async function seedEval(email: string) {
  const [ev] = await db
    .insert(evaluations)
    .values({
      linkedinUrl: "https://linkedin.com/in/att-" + rnd(),
      fullName: "Attendee",
      score: 80,
      founderScore: 80,
      investorScore: 0,
      signalQuality: "high",
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
      slug: "att-sync-" + rnd(),
      title: "Attendee Sync Test",
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

describe.skipIf(IS_PROD_DB)("syncEventAttendees", () => {
  it("upserts guests and matches profiles by email, idempotently", async () => {
    const matchEmail = `match-${rnd()}@example.com`;
    const seededEval = await seedEval(matchEmail);
    const lumaEventId = "evt-test-" + rnd();
    const event = await seedLumaEvent(lumaEventId);

    // Stub returns guests only for OUR event so other Luma rows in the dev DB
    // contribute nothing to the totals.
    const guests: LumaGuest[] = [
      {
        api_id: "gst-" + rnd(),
        approval_status: "approved",
        email: matchEmail.toUpperCase(), // case-insensitive match
        name: "Matched Person",
        user_api_id: "usr-" + rnd(),
        registered_at: "2026-05-20T10:00:00.000Z",
        checked_in_at: null,
      },
      {
        api_id: "gst-" + rnd(),
        approval_status: "pending",
        email: `nobody-${rnd()}@example.com`, // no profile
        name: "Unmatched Person",
        user_api_id: "usr-" + rnd(),
        registered_at: "2026-05-21T10:00:00.000Z",
        checked_in_at: null,
      },
    ];
    const fetchGuests = async (id: string) => (id === lumaEventId ? guests : []);

    const res = await syncEventAttendees({ fetchGuests });
    expect(res.attendees).toBe(2);
    expect(res.matched).toBe(1);
    expect(res.errors).toBe(0);

    const rows = await db
      .select()
      .from(eventAttendees)
      .where(eq(eventAttendees.eventId, event.id));
    expect(rows).toHaveLength(2);

    const matchedRow = rows.find((r) => r.approvalStatus === "approved")!;
    expect(matchedRow.evaluationId).toBe(seededEval.id);
    expect(matchedRow.email).toBe(matchEmail.toLowerCase());

    const unmatchedRow = rows.find((r) => r.approvalStatus === "pending")!;
    expect(unmatchedRow.evaluationId).toBeNull();

    // Re-sync with a status change on the second guest → still 2 rows, updated.
    guests[1]!.approval_status = "declined";
    const res2 = await syncEventAttendees({ fetchGuests });
    expect(res2.attendees).toBe(2);

    const rows2 = await db
      .select()
      .from(eventAttendees)
      .where(eq(eventAttendees.eventId, event.id));
    expect(rows2).toHaveLength(2);
    expect(rows2.some((r) => r.approvalStatus === "declined")).toBe(true);

    // Clean up so the fake source='luma' event doesn't break later real syncs
    // (deleting the event cascades to its attendees).
    await db.delete(events).where(eq(events.id, event.id));
    await db.delete(evaluations).where(eq(evaluations.id, seededEval.id));
  });

  it("skips events whose guest fetch fails and counts the error", async () => {
    const lumaEventId = "evt-fail-" + rnd();
    const event = await seedLumaEvent(lumaEventId);
    const fetchGuests = async (id: string) => {
      if (id === lumaEventId) throw new Error("403 no access");
      return [];
    };
    const res = await syncEventAttendees({ fetchGuests });
    expect(res.errors).toBeGreaterThanOrEqual(1);
    const rows = await db
      .select()
      .from(eventAttendees)
      .where(eq(eventAttendees.eventId, event.id));
    expect(rows).toHaveLength(0);
    await db.delete(events).where(eq(events.id, event.id));
  });
});
