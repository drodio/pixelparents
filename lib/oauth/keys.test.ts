import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { publicJwks, getSigningKey } from "./keys";

beforeAll(() => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  process.env.OAUTH_PRIVATE_KEY = privateKey;
});

describe("JWKS publication", () => {
  it("publishes ONLY public RSA members — never private key material", async () => {
    const { keys } = await publicJwks();
    expect(keys).toHaveLength(1);
    const jwk = keys[0]! as Record<string, unknown>;
    // Public members present.
    expect(jwk.kty).toBe("RSA");
    expect(typeof jwk.n).toBe("string");
    expect(jwk.e).toBe("AQAB");
    expect(jwk.alg).toBe("RS256");
    expect(jwk.use).toBe("sig");
    expect(typeof jwk.kid).toBe("string");
    // CRITICAL: no private RSA components may leak through the JWKS endpoint.
    for (const priv of ["d", "p", "q", "dp", "dq", "qi"]) {
      expect(jwk[priv], `private member "${priv}" must not be published`).toBeUndefined();
    }
  });

  it("the kid is stable across calls", async () => {
    const a = await getSigningKey();
    const b = await getSigningKey();
    expect(a.kid).toBe(b.kid);
  });
});

describe("missing key handling", () => {
  it("throws a clear OAuthKeyError when the env var is unset", async () => {
    // Reset the module-level cache by re-importing in isolation.
    const saved = process.env.OAUTH_PRIVATE_KEY;
    try {
      delete process.env.OAUTH_PRIVATE_KEY;
      // Fresh module instance (its own cache); assert on the error name/message
      // rather than instanceof, since the dynamic import has its own class object.
      const mod = await import(`./keys?bust=${Date.now()}`);
      await expect(mod.getSigningKey()).rejects.toMatchObject({
        name: "OAuthKeyError",
        message: expect.stringContaining("OAUTH_PRIVATE_KEY is not set"),
      });
    } finally {
      process.env.OAUTH_PRIVATE_KEY = saved;
    }
  });
});
