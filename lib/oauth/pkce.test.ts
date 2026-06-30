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
    // Flip the first char to a GUARANTEED-different one. A random verifier's
    // first char is already "A" ~1/64 of the time, so a fixed "A" prefix would
    // occasionally be a no-op tamper and flake the assertion.
    const tampered = (verifier[0] === "A" ? "B" : "A") + verifier.slice(1);
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
