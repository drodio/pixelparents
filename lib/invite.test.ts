import { describe, it, expect } from "vitest";
import { parseInviteEmails, grantedQuota, MAX_INVITES, INVITE_LIFETIME_CAP } from "@/lib/invite";

describe("parseInviteEmails", () => {
  it("splits on commas and whitespace", () => {
    expect(parseInviteEmails("a@x.com, b@y.com c@z.com")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
  });

  it("lowercases and trims", () => {
    expect(parseInviteEmails("  A@X.COM ")).toEqual(["a@x.com"]);
  });

  it("dedupes case-insensitively", () => {
    expect(parseInviteEmails("a@x.com, A@X.com, a@x.com")).toEqual(["a@x.com"]);
  });

  it("drops invalid entries", () => {
    expect(parseInviteEmails("good@x.com, nope, also bad@, @bad.com")).toEqual([
      "good@x.com",
    ]);
  });

  it("returns an empty array for empty / whitespace input", () => {
    expect(parseInviteEmails("")).toEqual([]);
    expect(parseInviteEmails("   ,  , ")).toEqual([]);
  });

  it("caps the result at MAX_INVITES", () => {
    const many = Array.from({ length: MAX_INVITES + 5 }, (_, i) => `u${i}@x.com`).join(", ");
    const out = parseInviteEmails(many);
    expect(out).toHaveLength(MAX_INVITES);
    expect(out[0]).toBe("u0@x.com");
  });
});

describe("grantedQuota (mirrors the SQL reserve clamp)", () => {
  it("grants the full amount when well under the cap", () => {
    expect(grantedQuota(0, 3)).toBe(3);
    expect(grantedQuota(5, 4)).toBe(4);
  });

  it("trims to the remaining room near the cap", () => {
    expect(grantedQuota(INVITE_LIFETIME_CAP - 2, 5)).toBe(2);
  });

  it("grants 0 once at or over the cap", () => {
    expect(grantedQuota(INVITE_LIFETIME_CAP, 5)).toBe(0);
    expect(grantedQuota(INVITE_LIFETIME_CAP + 10, 1)).toBe(0);
  });

  it("never returns negative and clamps negative inputs", () => {
    expect(grantedQuota(0, 0)).toBe(0);
    expect(grantedQuota(-5, 3)).toBe(3);
    expect(grantedQuota(3, -2)).toBe(0);
  });

  it("respects an explicit cap argument", () => {
    expect(grantedQuota(1, 10, 3)).toBe(2);
  });
});
