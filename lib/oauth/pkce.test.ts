import { describe, it, expect } from "vitest";
import {
  deriveS256Challenge,
  verifyPkce,
  isValidCodeVerifier,
  isValidCodeChallenge,
  generatePkcePair,
} from "./pkce";

describe("PKCE S256", () => {
  it("derives the known RFC 7636 test-vector challenge", () => {
    // RFC 7636 Appendix B test vector.
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expected = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(deriveS256Challenge(verifier)).toBe(expected);
  });

  it("verifyPkce accepts a matching verifier and rejects a mismatch", () => {
    const { verifier, challenge } = generatePkcePair();
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce(verifier + "x".repeat(0), challenge.slice(0, -1) + "A")).toBe(false);
  });

  it("rejects a tampered verifier", () => {
    const { verifier, challenge } = generatePkcePair();
    const tampered = "A" + verifier.slice(1);
    expect(verifyPkce(tampered, challenge)).toBe(false);
  });

  it("rejects malformed verifiers (too short / bad charset)", () => {
    expect(isValidCodeVerifier("short")).toBe(false);
    expect(isValidCodeVerifier("has spaces in it ".padEnd(50, "x"))).toBe(false);
    expect(verifyPkce("short", deriveS256Challenge("short"))).toBe(false);
    const { verifier, challenge } = generatePkcePair();
    expect(isValidCodeVerifier(verifier)).toBe(true);
    expect(isValidCodeChallenge(challenge)).toBe(true);
  });

  it("a verifier of valid length round-trips", () => {
    const verifier = "a".repeat(43);
    expect(isValidCodeVerifier(verifier)).toBe(true);
    expect(verifyPkce(verifier, deriveS256Challenge(verifier))).toBe(true);
  });
});
