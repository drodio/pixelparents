import { describe, it, expect } from "vitest";
import {
  normalizeEmail,
  isEmail,
  orderEmailsForDisplay,
  type ProfileEmail,
} from "@/lib/profile-emails";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Jane@Acme.COM ")).toBe("jane@acme.com");
  });
});

describe("isEmail", () => {
  it("accepts a normal address", () => {
    expect(isEmail("jane@acme.com")).toBe(true);
  });
  it("rejects non-emails", () => {
    expect(isEmail("Jane Doe")).toBe(false);
    expect(isEmail("acme.com")).toBe(false);
    expect(isEmail("jane@acme")).toBe(false);
    expect(isEmail("")).toBe(false);
  });
});

describe("orderEmailsForDisplay", () => {
  const e = (email: string, status: "verified" | "unverified", t = 0): ProfileEmail => ({
    email, status, source: "operator", addedAt: new Date(t),
  });

  it("puts verified before unverified", () => {
    const out = orderEmailsForDisplay([e("u@x.com", "unverified"), e("v@x.com", "verified")]);
    expect(out.map((r) => r.email)).toEqual(["v@x.com", "u@x.com"]);
  });
  it("breaks ties by most-recently-added", () => {
    const out = orderEmailsForDisplay([
      e("old@x.com", "verified", 1000),
      e("new@x.com", "verified", 5000),
    ]);
    expect(out.map((r) => r.email)).toEqual(["new@x.com", "old@x.com"]);
  });
  it("does not mutate the input array", () => {
    const input = [e("u@x.com", "unverified"), e("v@x.com", "verified")];
    orderEmailsForDisplay(input);
    expect(input[0]!.email).toBe("u@x.com");
  });
});
