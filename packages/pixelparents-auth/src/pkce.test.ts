import { describe, it, expect } from "vitest";
import {
  generatePkcePair,
  deriveS256Challenge,
  generateState,
  generateNonce,
  randomUrlSafe,
} from "./pkce.js";

// A base64url string: A–Z a–z 0–9 - _ and no padding.
const BASE64URL = /^[A-Za-z0-9\-_]+$/;
// RFC 7636 verifier: 43–128 chars from the unreserved set.
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
// S256 challenge: base64url of a 32-byte digest → exactly 43 chars.
const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/;

describe("PKCE generation", () => {
  it("produces an RFC 7636-compliant verifier and an S256 challenge", async () => {
    const pair = await generatePkcePair();
    expect(pair.codeChallengeMethod).toBe("S256");
    expect(pair.codeVerifier).toMatch(VERIFIER_RE);
    expect(pair.codeChallenge).toMatch(CHALLENGE_RE);
  });

  it("derives challenge = BASE64URL(SHA256(verifier)) deterministically", async () => {
    const pair = await generatePkcePair();
    const rederived = await deriveS256Challenge(pair.codeVerifier);
    expect(rederived).toBe(pair.codeChallenge);
  });

  it("matches the known RFC 7636 Appendix B test vector", async () => {
    // RFC 7636 §B: verifier "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    // → challenge "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await deriveS256Challenge(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("generates a fresh, unique verifier each call (high entropy)", async () => {
    const a = await generatePkcePair();
    const b = await generatePkcePair();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
  });
});

describe("state / nonce", () => {
  it("are base64url and unique", () => {
    const s1 = generateState();
    const s2 = generateState();
    const n1 = generateNonce();
    expect(s1).toMatch(BASE64URL);
    expect(n1).toMatch(BASE64URL);
    expect(s1).not.toBe(s2);
    expect(s1).not.toBe(n1);
  });
});

describe("randomUrlSafe", () => {
  it("encodes the requested number of bytes as base64url with no padding", () => {
    const v = randomUrlSafe(32);
    expect(v).toMatch(BASE64URL);
    expect(v).not.toContain("=");
    // 32 bytes → 43 base64url chars.
    expect(v.length).toBe(43);
  });
});
