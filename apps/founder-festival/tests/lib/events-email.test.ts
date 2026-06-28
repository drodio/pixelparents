import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email", () => ({
  sendApprovedEmail: vi.fn().mockResolvedValue({ id: "msg1" }),
  sendFutureEventsEmail: vi.fn().mockResolvedValue({ id: "msg2" }),
}));

import { db } from "@/db";
import { events, eventApplicants } from "@/db/schema";
import { transitionApplicant } from "@/lib/events";
import { sendApprovedEmail, sendFutureEventsEmail } from "@/lib/email";

function rand() {
  return Math.random().toString(36).slice(2, 8);
}

describe("transitionApplicant email side-effects", () => {
  beforeEach(() => vi.clearAllMocks());

  // P0-2 (anti-relay): the event-apply endpoint is unauthenticated and the
  // auto-approval emails a body-supplied address. A per-RECIPIENT daily cap means
  // a legit applicant (1 event email) is unaffected, but an attacker can't spam
  // one victim by applying many harvested evaluationIds with that victim's email.
  it("caps decision emails per recipient per day", async () => {
    const prev = process.env.EVENT_EMAIL_PER_RECIPIENT_PER_DAY;
    process.env.EVENT_EMAIL_PER_RECIPIENT_PER_DAY = "2";
    try {
      const victim = `victim-${rand()}@target.com`;
      const [e] = await db
        .insert(events)
        .values({
          slug: "cap-" + rand(),
          title: "Cap Test",
          startsAt: new Date("2026-07-01"),
          status: "open",
          approvalMode: "manual",
          criteria: {},
        })
        .returning();
      // Three separate applications, all targeting the same recipient email.
      for (let i = 0; i < 3; i++) {
        const [a] = await db
          .insert(eventApplicants)
          .values({
            eventId: e.id,
            linkedinUrl: `https://www.linkedin.com/in/cap-${rand()}`,
            email: victim,
            status: "scored",
          })
          .returning();
        await transitionApplicant({ applicantId: a.id, toStatus: "approved", reason: "t", actorEmail: "admin@x" });
      }
      // Only the first 2 reach the victim; the 3rd is capped.
      const toVictim = vi
        .mocked(sendApprovedEmail)
        .mock.calls.filter((c) => c[0]?.to === victim);
      expect(toVictim).toHaveLength(2);
    } finally {
      if (prev === undefined) delete process.env.EVENT_EMAIL_PER_RECIPIENT_PER_DAY;
      else process.env.EVENT_EMAIL_PER_RECIPIENT_PER_DAY = prev;
    }
  });

  it("sends approved email when transitioning to approved", async () => {
    // Unique recipient per run so the per-recipient daily cap (added for the
    // anti-relay fix) can't accumulate across CI runs and flake this test.
    const recipient = `applicant-${rand()}@example.com`;
    const [e] = await db.insert(events).values({
      slug: "em-" + rand(),
      title: "Email Test", startsAt: new Date("2026-07-01"), status: "open", approvalMode: "manual",
      criteria: {},
    }).returning();
    const [a] = await db.insert(eventApplicants).values({
      eventId: e.id, linkedinUrl: "https://www.linkedin.com/in/em-" + rand(), email: recipient, status: "scored",
    }).returning();
    await transitionApplicant({ applicantId: a.id, toStatus: "approved", reason: "test", actorEmail: "admin@x" });
    expect(sendApprovedEmail).toHaveBeenCalledWith(expect.objectContaining({ to: recipient }));
  });

  it("sends future-events email on waitlist", async () => {
    const recipient = `wl-${rand()}@example.com`;
    const [e] = await db.insert(events).values({
      slug: "wl-" + rand(),
      title: "WL", startsAt: new Date("2026-07-01"), status: "open", approvalMode: "manual",
      criteria: {},
    }).returning();
    const [a] = await db.insert(eventApplicants).values({
      eventId: e.id, linkedinUrl: "https://www.linkedin.com/in/wl-" + rand(), email: recipient, status: "scored",
    }).returning();
    await transitionApplicant({ applicantId: a.id, toStatus: "waitlist", reason: "ok", actorEmail: "admin@x" });
    expect(sendFutureEventsEmail).toHaveBeenCalledWith(expect.objectContaining({ to: recipient }));
  });
});
