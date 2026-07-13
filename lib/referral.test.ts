import { describe, it, expect } from "vitest";
import {
  sanitizeRefToken,
  signupReferralUrl,
  REFERRAL_PARAM,
  REFERRAL_AS_PARAM,
} from "@/lib/referral";

describe("sanitizeRefToken", () => {
  it("accepts a base64url-shaped token", () => {
    expect(sanitizeRefToken("AbC-123_xyz")).toBe("AbC-123_xyz");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeRefToken("  tok123  ")).toBe("tok123");
  });

  it("rejects non-strings", () => {
    expect(sanitizeRefToken(undefined)).toBeNull();
    expect(sanitizeRefToken(null)).toBeNull();
    expect(sanitizeRefToken(42)).toBeNull();
    expect(sanitizeRefToken({})).toBeNull();
  });

  it("rejects empty / whitespace", () => {
    expect(sanitizeRefToken("")).toBeNull();
    expect(sanitizeRefToken("   ")).toBeNull();
  });

  it("rejects tokens with illegal characters", () => {
    expect(sanitizeRefToken("has spaces")).toBeNull();
    expect(sanitizeRefToken("semi;colon")).toBeNull();
    expect(sanitizeRefToken("../etc/passwd")).toBeNull();
    expect(sanitizeRefToken("<script>")).toBeNull();
  });

  it("rejects an over-long token", () => {
    expect(sanitizeRefToken("a".repeat(65))).toBeNull();
    expect(sanitizeRefToken("a".repeat(64))).toBe("a".repeat(64));
  });
});

describe("signupReferralUrl", () => {
  it("builds a family referral link with the ref param", () => {
    expect(signupReferralUrl("https://gopixel.org", "tok123")).toBe(
      `https://gopixel.org/signup?${REFERRAL_PARAM}=tok123`,
    );
  });

  it("adds as=student for student referrals", () => {
    const url = signupReferralUrl("https://gopixel.org", "tok123", { student: true });
    expect(url).toContain(`${REFERRAL_PARAM}=tok123`);
    expect(url).toContain(`${REFERRAL_AS_PARAM}=student`);
    expect(url.startsWith("https://gopixel.org/signup?")).toBe(true);
  });

  it("strips a trailing slash from the base url", () => {
    expect(signupReferralUrl("https://gopixel.org/", "tok123")).toBe(
      `https://gopixel.org/signup?${REFERRAL_PARAM}=tok123`,
    );
  });

  it("omits the ref param entirely for a garbage token (no naked ?)", () => {
    expect(signupReferralUrl("https://gopixel.org", "bad token")).toBe(
      "https://gopixel.org/signup",
    );
  });
});
