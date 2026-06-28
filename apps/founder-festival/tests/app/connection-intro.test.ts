import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/db";
import { events, eventAttendees, evaluations } from "@/db/schema";
import { IS_PROD_DB } from "../setup";

const sendMock = vi.fn(async (_opts: unknown) => ({ id: "test" }));
vi.mock("@/lib/email", () => ({ sendConnectionIntroEmail: (a: unknown) => sendMock(a) }));

const rnd = () => Math.random().toString(36).slice(2, 8);

async function seedPerson(name: string, email: string | null, eventId: string) {
  const [ev] = await db.insert(evaluations).values({
    linkedinUrl: "https://linkedin.com/in/ci-" + rnd(),
    fullName: name, slug: name.toLowerCase().replace(/\s+/g, "-") + "-" + rnd(),
    slugKind: "founder", score: 50, founderScore: 50, investorScore: 0,
    signalQuality: "high", source: "url",
  }).returning();
  await db.insert(eventAttendees).values({
    eventId, evaluationId: ev.id, lumaGuestApiId: "gst-" + rnd(),
    name, email, approvalStatus: "approved", source: "luma",
  });
  return ev;
}

describe.skipIf(IS_PROD_DB)("introduceConnection", () => {
  beforeEach(() => sendMock.mockClear());

  it("sends one intro to both resolved emails", async () => {
    const { introduceConnection } = await import("@/lib/attendee-connections");
    const [event] = await db.insert(events).values({
      slug: "ci-" + rnd(), title: "CI Dinner", startsAt: new Date("2026-06-03"),
      status: "open", criteria: {}, source: "luma",
    }).returning();
    const a = await seedPerson("Ada CI", `a-${rnd()}@x.com`, event.id);
    const b = await seedPerson("Alan CI", `b-${rnd()}@x.com`, event.id);

    await introduceConnection({ fromEvaluationId: a.id, toEvaluationId: b.id, eventId: event.id }, "https://festival.so");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = (sendMock.mock.calls[0] as [{ toEmails: string[] }])[0];
    expect(arg.toEmails.length).toBe(2);
  });

  it("skips the send when one person has no email", async () => {
    const { introduceConnection } = await import("@/lib/attendee-connections");
    const [event] = await db.insert(events).values({
      slug: "ci-" + rnd(), title: "CI Dinner", startsAt: new Date("2026-06-03"),
      status: "open", criteria: {}, source: "luma",
    }).returning();
    const a = await seedPerson("Ada CI", `a-${rnd()}@x.com`, event.id);
    const b = await seedPerson("Noemail CI", null, event.id);

    await introduceConnection({ fromEvaluationId: a.id, toEvaluationId: b.id, eventId: event.id }, "https://festival.so");
    expect(sendMock).not.toHaveBeenCalled();
  });
});
