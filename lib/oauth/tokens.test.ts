import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { jwtVerify, importSPKI } from "jose";
import { mintIdToken, mintAccessToken } from "./tokens";
import { buildIdTokenClaims } from "./claims";
import { generateClientSecret, verifyClientSecret } from "./secrets";

// Generate an RSA keypair and feed the private half to the signer via the env var
// the provider reads (OAUTH_PRIVATE_KEY). We verify with the public half.
let publicPem: string;

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  process.env.OAUTH_PRIVATE_KEY = privateKey;
  publicPem = publicKey;
});

describe("ID token minting + verification (the ohs_verified assertion)", () => {
  it("mints a verifiable RS256 ID token carrying ohs_verified + nonce", async () => {
    const claims = buildIdTokenClaims({
      scopes: ["openid", "email", "ohs_verified"],
      email: "parent@example.com",
      signup: { extra: { approvalStatus: "approved" }, createdAt: new Date("2026-09-01") } as never,
    });
    const jwt = await mintIdToken({
      issuer: "https://pixelparents.app",
      clientId: "ppc_live_abc",
      subject: "user_123",
      nonce: "nonce-xyz",
      claims,
    });

    const pub = await importSPKI(publicPem, "RS256");
    const { payload, protectedHeader } = await jwtVerify(jwt, pub, {
      issuer: "https://pixelparents.app",
      audience: "ppc_live_abc",
    });
    expect(protectedHeader.alg).toBe("RS256");
    expect(protectedHeader.kid).toBeTruthy();
    expect(payload.sub).toBe("user_123");
    expect(payload.nonce).toBe("nonce-xyz");
    expect(payload.email).toBe("parent@example.com");
    expect(payload.ohs_verified).toBe(true);
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("a tampered token fails verification", async () => {
    const jwt = await mintAccessToken({
      issuer: "https://pixelparents.app",
      clientId: "ppc_live_abc",
      subject: "user_123",
      scope: "openid",
    });
    const pub = await importSPKI(publicPem, "RS256");
    const parts = jwt.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${"A".repeat(parts[2]!.length)}`;
    await expect(jwtVerify(tampered, pub)).rejects.toBeTruthy();
  });
});

describe("client secret hashing", () => {
  it("round-trips and rejects a wrong secret", () => {
    const { raw, hash, prefix } = generateClientSecret();
    expect(prefix.startsWith("ppcs_live_")).toBe(true);
    expect(verifyClientSecret(raw, hash)).toBe(true);
    expect(verifyClientSecret(raw + "x", hash)).toBe(false);
  });
});
