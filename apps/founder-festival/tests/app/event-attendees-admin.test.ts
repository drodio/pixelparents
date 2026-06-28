import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { events, eventAttendees, evaluations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { IS_PROD_DB } from "../setup";
import { resolveEventAttendeeEvalIds } from "@/lib/events";
import {
  listEventAttendeesAdmin,
  addManualAttendee,
  removeAttendee,
} from "@/lib/event-attendees-admin";

const rnd = () => Math.random().toString(36).slice(2, 8);

async function seedEval(name: string, score = 80) {
  const [ev] = await db
    .insert(evaluations)
    .values({
      linkedinUrl: "https://linkedin.com/in/adm-" + rnd(),
      fullName: name,
      score,
      founderScore: score,
      investorScore: 0,
      signalQuality: "high",
      source: "url",
    })
    .returning();
  return ev;
}

async function seedEvent() {
  const [e] = await db
    .insert(events)
    .values({
      slug: "adm-att-" + rnd(),
      title: "Admin Attendee Test",
      startsAt: new Date("2026-06-01"),
      status: "open",
      criteria: {},
      source: "luma",
    })
    .returning();
  return e;
}

describe.skipIf(IS_PROD_DB)("event-attendees-admin", () => {
  it("adds a manual attendee, lists it matched, and re-add un-removes", async () => {
    const event = await seedEvent();
    const ev = await seedEval("Manual Person " + rnd(), 123);

    const added = await addManualAttendee(event.id, ev.id);
    expect(added.ok).toBe(true);

    let list = await listEventAttendeesAdmin(event.id);
    const mine = list.find((r) => r.evaluationId === ev.id);
    expect(mine).toBeTruthy();
    expect(mine!.matched).toBe(true);
    expect(mine!.source).toBe("manual");
    expect(mine!.combinedScore).toBe(123);

    const removed = await removeAttendee(event.id, mine!.id);
    expect(removed).toBe(true);
    list = await listEventAttendeesAdmin(event.id);
    expect(list.find((r) => r.evaluationId === ev.id)).toBeFalsy();
    const { evalIds } = await resolveEventAttendeeEvalIds(event.id);
    expect(evalIds).not.toContain(ev.id);

    await addManualAttendee(event.id, ev.id);
    const rows = await db
      .select({ id: eventAttendees.id })
      .from(eventAttendees)
      .where(and(eq(eventAttendees.eventId, event.id), eq(eventAttendees.evaluationId, ev.id)));
    expect(rows.length).toBe(1);
    const { evalIds: again } = await resolveEventAttendeeEvalIds(event.id);
    expect(again).toContain(ev.id);
  });

  it("removeAttendee removes the whole person when both a Luma row and a manual row exist", async () => {
    const event = await seedEvent();
    const ev = await seedEval("Dual Row Person " + rnd(), 90);

    // Insert a Luma row for the same person.
    await db.insert(eventAttendees).values({
      eventId: event.id,
      evaluationId: ev.id,
      lumaGuestApiId: "gst-" + rnd(),
      name: ev.fullName ?? null,
      approvalStatus: "approved",
      source: "luma",
    });

    // Also add a manual row (upserts via synthetic key "manual:<evalId>").
    const addResult = await addManualAttendee(event.id, ev.id);
    expect(addResult.ok).toBe(true);

    // Both rows exist; the eval should be visible in the resolver.
    const { evalIds: before } = await resolveEventAttendeeEvalIds(event.id);
    expect(before).toContain(ev.id);

    // The admin list dedupes to one row (manual wins). Get that row's id.
    const list = await listEventAttendeesAdmin(event.id);
    const adminRow = list.find((r) => r.evaluationId === ev.id);
    expect(adminRow).toBeTruthy();

    // Remove via the deduped id — should remove BOTH underlying rows.
    const removed = await removeAttendee(event.id, adminRow!.id);
    expect(removed).toBe(true);

    // The eval must no longer appear in the resolver (i.e. both rows are gone).
    const { evalIds: after } = await resolveEventAttendeeEvalIds(event.id);
    expect(after).not.toContain(ev.id);
  });

  it("resolver excludes admin-removed Luma rows", async () => {
    const event = await seedEvent();
    const ev = await seedEval("Luma Person " + rnd());
    const [row] = await db
      .insert(eventAttendees)
      .values({
        eventId: event.id,
        evaluationId: ev.id,
        lumaGuestApiId: "gst-" + rnd(),
        name: "Luma Person",
        approvalStatus: "approved",
        source: "luma",
      })
      .returning();

    let { evalIds } = await resolveEventAttendeeEvalIds(event.id);
    expect(evalIds).toContain(ev.id);

    await removeAttendee(event.id, row.id);
    ({ evalIds } = await resolveEventAttendeeEvalIds(event.id));
    expect(evalIds).not.toContain(ev.id);
  });
});
