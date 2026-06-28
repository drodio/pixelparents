import { describe, it, expect } from "vitest";
import { domainHost, domainHostOrNull } from "@/lib/domain-normalize";

describe("domainHost", () => {
  it("lowercases and strips a leading www.", () => {
    expect(domainHost("WWW.Stripe.com")).toBe("stripe.com");
  });
  it("strips the http/https protocol", () => {
    expect(domainHost("https://stripe.com")).toBe("stripe.com");
    expect(domainHost("HTTP://Stripe.com")).toBe("stripe.com");
  });
  it("drops any path / query / fragment, keeping only the host", () => {
    expect(domainHost("https://www.stripe.com/about?x=1#top")).toBe("stripe.com");
    expect(domainHost("stripe.com/")).toBe("stripe.com");
  });
  it("trims surrounding whitespace", () => {
    expect(domainHost("  stripe.com  ")).toBe("stripe.com");
  });
  it("keeps subdomains other than www (they're meaningful)", () => {
    expect(domainHost("https://blog.stripe.com")).toBe("blog.stripe.com");
  });
  it("returns '' for empty input", () => {
    expect(domainHost("")).toBe("");
  });
  it("is idempotent on an already-clean host", () => {
    expect(domainHost("stripe.com")).toBe("stripe.com");
  });
});

describe("domainHostOrNull", () => {
  it("returns null for null/undefined/empty", () => {
    expect(domainHostOrNull(null)).toBeNull();
    expect(domainHostOrNull(undefined)).toBeNull();
    expect(domainHostOrNull("   ")).toBeNull();
  });
  it("matches domainHost for real input", () => {
    expect(domainHostOrNull("https://www.Acme.io/x")).toBe("acme.io");
  });
});
