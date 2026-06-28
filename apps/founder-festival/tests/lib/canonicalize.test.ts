import { describe, it, expect } from "vitest";
import { canonicalizeLinkedinUrl, isValidLinkedinUrl } from "@/lib/canonicalize";

describe("canonicalizeLinkedinUrl", () => {
  it("lowercases and strips trailing slash", () => {
    expect(canonicalizeLinkedinUrl("https://www.LinkedIn.com/in/JohnDoe/")).toBe(
      "https://linkedin.com/in/johndoe",
    );
  });
  it("strips query and hash", () => {
    expect(canonicalizeLinkedinUrl("https://linkedin.com/in/jane?utm=x#about")).toBe(
      "https://linkedin.com/in/jane",
    );
  });
  it("strips www subdomain", () => {
    expect(canonicalizeLinkedinUrl("https://www.linkedin.com/in/jane")).toBe(
      "https://linkedin.com/in/jane",
    );
  });
  it("returns null for non-LinkedIn URLs", () => {
    expect(canonicalizeLinkedinUrl("https://twitter.com/jane")).toBeNull();
  });
  it("returns null for garbage", () => {
    expect(canonicalizeLinkedinUrl("not a url")).toBeNull();
  });
});

describe("isValidLinkedinUrl", () => {
  it("accepts canonical form", () => {
    expect(isValidLinkedinUrl("https://linkedin.com/in/jane")).toBe(true);
  });
  it("rejects /company URLs", () => {
    expect(isValidLinkedinUrl("https://linkedin.com/company/acme")).toBe(false);
  });
});
