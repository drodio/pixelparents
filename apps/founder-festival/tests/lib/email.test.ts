import { describe, it, expect, vi } from "vitest";

vi.mock("resend", () => {
  const send = vi.fn().mockResolvedValue({ data: { id: "msg_xyz" }, error: null });
  return { Resend: vi.fn().mockImplementation(function () { return { emails: { send } }; }) };
});

import { sendApprovedEmail, sendFutureEventsEmail } from "@/lib/email";
import { Resend } from "resend";

describe("email", () => {
  it("sendApprovedEmail renders subject + body", async () => {
    const res = await sendApprovedEmail({
      to: "applicant@example.com",
      eventTitle: "Founder Dinner",
      startsAt: new Date("2026-06-02T18:00:00Z"),
      venue: "Slack HQ",
      lumaUrl: null,
    });
    expect(res.id).toBe("msg_xyz");
    const inst = (Resend as unknown as { mock: { results: { value: { emails: { send: { mock: { calls: unknown[][] } } } } }[] } }).mock.results[0].value;
    const call = inst.emails.send.mock.calls[0][0] as { subject: string; html: string; to: string };
    expect(call.subject).toMatch(/you'?re in/i);
    expect(call.html).toContain("Slack HQ");
  });

  it("formats startsAt in Pacific time", async () => {
    await sendApprovedEmail({
      to: "x@y.com",
      eventTitle: "PT Event",
      startsAt: new Date("2026-06-02T01:00:00Z"),  // 6:00 PM PT on June 1
      venue: null,
      lumaUrl: null,
    });
    const inst = (Resend as unknown as { mock: { results: Array<{ value: { emails: { send: { mock: { calls: unknown[][] } } } } }> } }).mock.results[0].value;
    const lastCall = inst.emails.send.mock.calls[inst.emails.send.mock.calls.length - 1][0] as { html: string };
    // Should render the PT time, not UTC. June 1 at 6 PM PT.
    expect(lastCall.html).toMatch(/Mon, Jun 1.*6:00 PM PDT/);
  });

  it("sendFutureEventsEmail avoids rejection language", async () => {
    await sendFutureEventsEmail({ to: "applicant@example.com", eventTitle: "Founder Dinner" });
    // The module instantiates Resend once at import time, so both helpers
    // share the same `emails.send` mock. The previous test consumed call[0];
    // this test inspects call[1].
    const inst = (Resend as unknown as { mock: { results: { value: { emails: { send: { mock: { calls: unknown[][] } } } } }[] } }).mock.results[0].value;
    const call = inst.emails.send.mock.calls[1][0] as { subject: string; html: string };
    expect(call.subject).not.toMatch(/reject|denied|sorry|unfortunately/i);
    expect(call.html).not.toMatch(/reject|denied|sorry|unfortunately/i);
  });
});
