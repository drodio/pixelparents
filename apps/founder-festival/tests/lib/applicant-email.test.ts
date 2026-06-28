import { describe, it, expect } from "vitest";
import { isValidApplicantEmail } from "@/lib/email";

// P0-2: the event-apply endpoint stored a client-supplied `email` that
// downstream auto-approval mails. Beyond rate-limiting, the raw value must be a
// well-formed single address — rejecting garbage and, critically, embedded
// newlines that could smuggle extra headers/recipients.
describe("isValidApplicantEmail", () => {
  it.each([
    "a@b.com",
    "sam.rivera@stripe.com",
    "sam.rivera+festival@stripe.com",
    "x@eu.stripe.com",
  ])("accepts %s", (email) => {
    expect(isValidApplicantEmail(email)).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["   ", "whitespace only"],
    ["no-at-sign", "missing @"],
    ["a@b", "no TLD dot"],
    ["a@@b.com", "double @"],
    ["a b@c.com", "internal space"],
    ["a@b.com\nbcc: victim@target.com", "header injection via newline"],
    ["a@b.com\r\nDATA", "CRLF injection"],
    [`${"x".repeat(250)}@b.com`, "over 254 chars"],
  ])("rejects %s (%s)", (email) => {
    expect(isValidApplicantEmail(email)).toBe(false);
  });
});
