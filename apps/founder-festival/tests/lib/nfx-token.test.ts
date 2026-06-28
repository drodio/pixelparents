import { describe, it, expect } from "vitest";
import { getTokenExpiry } from "@/lib/nfx-token";

// Build a fake JWT with a given exp (only the payload matters to our decoder).
function fakeJwt(exp: number): string {
  const b64url = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url({ alg: "RS256" })}.${b64url({ exp })}.sig`;
}

const NOW = 1_700_000_000_000; // fixed "now" in ms

describe("getTokenExpiry", () => {
  it("returns null for missing / malformed tokens", () => {
    expect(getTokenExpiry(undefined)).toBeNull();
    expect(getTokenExpiry("")).toBeNull();
    expect(getTokenExpiry("not-a-jwt")).toBeNull();
    expect(getTokenExpiry("only.two")).toBeNull();
  });

  it("returns null when the payload has no exp", () => {
    const noExp = Buffer.from(JSON.stringify({ sub: "x" })).toString("base64url");
    expect(getTokenExpiry(`h.${noExp}.s`)).toBeNull();
  });

  it("computes daysLeft for a future expiry", () => {
    const exp = Math.floor(NOW / 1000) + 30 * 86_400; // 30 days out
    const r = getTokenExpiry(fakeJwt(exp), NOW)!;
    expect(r).not.toBeNull();
    expect(r.expired).toBe(false);
    expect(Math.round(r.daysLeft)).toBe(30);
  });

  it("flags an already-expired token with negative daysLeft", () => {
    const exp = Math.floor(NOW / 1000) - 5 * 86_400; // 5 days ago
    const r = getTokenExpiry(fakeJwt(exp), NOW)!;
    expect(r.expired).toBe(true);
    expect(r.daysLeft).toBeLessThan(0);
  });
});
