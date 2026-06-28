import { describe, it, expect, vi } from "vitest";

vi.mock("resend", () => {
  const send = vi.fn().mockResolvedValue({ data: { id: "msg_bcc" }, error: null });
  return { Resend: vi.fn().mockImplementation(function () { return { emails: { send } }; }) };
});

import { parseBccList, sendRawEmailWithoutSignature } from "@/lib/email";
import { Resend } from "resend";

function lastSendCall() {
  const inst = (Resend as unknown as {
    mock: { results: Array<{ value: { emails: { send: { mock: { calls: unknown[][] } } } } }> };
  }).mock.results[0].value;
  const calls = inst.emails.send.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
}

describe("parseBccList", () => {
  it("returns [] for empty / null / whitespace", () => {
    expect(parseBccList(null)).toEqual([]);
    expect(parseBccList(undefined)).toEqual([]);
    expect(parseBccList("   ")).toEqual([]);
  });

  it("splits on commas, semicolons, and whitespace", () => {
    expect(parseBccList("a@x.com, b@y.com; c@z.com d@w.com")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
      "d@w.com",
    ]);
  });

  it("lowercases and dedupes", () => {
    expect(parseBccList("Ops@Festival.so, ops@festival.so")).toEqual(["ops@festival.so"]);
  });

  it("drops invalid tokens", () => {
    expect(parseBccList("good@x.com, not-an-email, bad@,@bad")).toEqual(["good@x.com"]);
  });

  it("neutralizes CRLF header-injection: every result is whitespace-free", () => {
    // A newline is a delimiter, so it can never smuggle a header into one address.
    const out = parseBccList("ok@x.com\r\nBcc: attacker@evil.com");
    expect(out.every((e) => !/\s/.test(e))).toBe(true);
    expect(out).toContain("ok@x.com");
  });
});

describe("sendRawEmailWithoutSignature bcc passthrough", () => {
  it("includes bcc when a non-empty array is given", async () => {
    await sendRawEmailWithoutSignature({
      from: "f@x.com",
      to: "t@x.com",
      bcc: ["ops@festival.so"],
      subject: "s",
      html: "<p>h</p>",
    });
    expect(lastSendCall().bcc).toEqual(["ops@festival.so"]);
  });

  it("omits bcc entirely when empty array or undefined", async () => {
    await sendRawEmailWithoutSignature({ from: "f@x.com", to: "t@x.com", bcc: [], subject: "s", html: "h" });
    expect("bcc" in lastSendCall()).toBe(false);
    await sendRawEmailWithoutSignature({ from: "f@x.com", to: "t@x.com", subject: "s", html: "h" });
    expect("bcc" in lastSendCall()).toBe(false);
  });
});
