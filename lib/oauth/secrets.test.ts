import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  pairwiseSub,
  pairwiseFamilyId,
  generateRefreshToken,
  __resetPepperForTests,
  REFRESH_TOKEN_PREFIX,
} from "./secrets";

// The pairwise identifiers need OAUTH_PRIVATE_KEY (the pepper source).
beforeAll(() => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  process.env.OAUTH_PRIVATE_KEY = privateKey;
  __resetPepperForTests();
});

describe("pairwise sub (per-client, unlinkable)", () => {
  it("is stable for the same (client, user)", () => {
    const a = pairwiseSub("ppc_live_app1", "user_42");
    const b = pairwiseSub("ppc_live_app1", "user_42");
    expect(a).toBe(b);
    expect(a.startsWith("ppu_")).toBe(true);
  });

  it("differs for the same user across two clients (no cross-app correlation)", () => {
    const inApp1 = pairwiseSub("ppc_live_app1", "user_42");
    const inApp2 = pairwiseSub("ppc_live_app2", "user_42");
    expect(inApp1).not.toBe(inApp2);
  });

  it("differs for two users in the same client", () => {
    expect(pairwiseSub("ppc_live_app1", "user_1")).not.toBe(pairwiseSub("ppc_live_app1", "user_2"));
    // Never leaks the raw clerk id.
    expect(pairwiseSub("ppc_live_app1", "user_42")).not.toContain("user_42");
  });
});

describe("HMAC'd family_id (per-client, not reversible)", () => {
  it("is stable per (client, family) and per-client distinct", () => {
    const fam = "11111111-2222-3333-4444-555555555555";
    expect(pairwiseFamilyId("ppc_live_app1", fam)).toBe(pairwiseFamilyId("ppc_live_app1", fam));
    expect(pairwiseFamilyId("ppc_live_app1", fam)).not.toBe(pairwiseFamilyId("ppc_live_app2", fam));
    expect(pairwiseFamilyId("ppc_live_app1", fam)!.startsWith("fam_")).toBe(true);
    // Not reversible: the raw UUID isn't present.
    expect(pairwiseFamilyId("ppc_live_app1", fam)).not.toContain(fam);
  });

  it("returns null for a missing family id (claim omitted, not fabricated)", () => {
    expect(pairwiseFamilyId("ppc_live_app1", null)).toBeNull();
    expect(pairwiseFamilyId("ppc_live_app1", "  ")).toBeNull();
  });
});

describe("refresh token generation", () => {
  it("is vendor-namespaced and only the hash is stored", () => {
    const { raw, hash } = generateRefreshToken();
    expect(raw.startsWith(REFRESH_TOKEN_PREFIX)).toBe(true);
    expect(hash).not.toBe(raw);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
