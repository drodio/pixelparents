import { describe, it, expect } from "vitest";
import { extractEmailAddress, emailsMatch } from "@/lib/claim-thread";

describe("extractEmailAddress", () => {
  it("pulls the address out of a display-name form", () => {
    expect(extractEmailAddress("Jane Public <Jane@Example.com>")).toBe("jane@example.com");
  });
  it("passes a bare address (lowercased, trimmed)", () => {
    expect(extractEmailAddress("  Foo@Bar.IO ")).toBe("foo@bar.io");
  });
  it("returns empty for junk", () => {
    expect(extractEmailAddress("not an email")).toBe("");
    expect(extractEmailAddress("")).toBe("");
  });
});

describe("emailsMatch", () => {
  it("matches the same address across display-name vs bare forms", () => {
    expect(emailsMatch("Jane <jane@x.com>", "JANE@X.COM")).toBe(true);
  });
  it("rejects different addresses", () => {
    expect(emailsMatch("jane@x.com", "bob@x.com")).toBe(false);
  });
  it("rejects when either side has no parseable address", () => {
    expect(emailsMatch("jane@x.com", "")).toBe(false);
    expect(emailsMatch("garbage", "jane@x.com")).toBe(false);
  });
});
