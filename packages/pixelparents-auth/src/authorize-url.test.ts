import { describe, it, expect } from "vitest";
import { buildAuthorizeUrl, normalizeScope } from "./authorize-url.js";
import { defaultEndpoints } from "./endpoints.js";

const ENDPOINT = "https://pixelparents.org/oauth/authorize";

function build(overrides: Partial<Parameters<typeof buildAuthorizeUrl>[0]> = {}) {
  return buildAuthorizeUrl({
    authorizationEndpoint: ENDPOINT,
    clientId: "ppc_live_abc",
    redirectUri: "https://app.example.com/callback",
    scope: ["openid", "ohs_verified"],
    state: "STATE123",
    nonce: "NONCE456",
    codeChallenge: "CHALLENGE789",
    ...overrides,
  });
}

describe("normalizeScope", () => {
  it("always includes openid and dedupes", () => {
    expect(normalizeScope(["ohs_verified"])).toBe("openid ohs_verified");
    expect(normalizeScope(["openid", "openid", "email"])).toBe("openid email");
  });

  it("accepts a pre-joined string and splits it", () => {
    expect(normalizeScope("openid email ohs_verified")).toBe("openid email ohs_verified");
  });

  it("prepends openid when missing rather than failing", () => {
    expect(normalizeScope(["email"])).toBe("openid email");
  });
});

describe("buildAuthorizeUrl", () => {
  it("sets every Authorization Code + PKCE (S256) parameter", () => {
    const u = new URL(build());
    expect(u.origin + u.pathname).toBe(ENDPOINT);
    const p = u.searchParams;
    expect(p.get("response_type")).toBe("code");
    expect(p.get("client_id")).toBe("ppc_live_abc");
    expect(p.get("redirect_uri")).toBe("https://app.example.com/callback");
    expect(p.get("scope")).toBe("openid ohs_verified");
    expect(p.get("state")).toBe("STATE123");
    expect(p.get("nonce")).toBe("NONCE456");
    expect(p.get("code_challenge")).toBe("CHALLENGE789");
    expect(p.get("code_challenge_method")).toBe("S256");
  });

  it("always forces code_challenge_method=S256 (never plain)", () => {
    const p = new URL(build()).searchParams;
    expect(p.get("code_challenge_method")).toBe("S256");
  });

  it("normalizes scope to include openid", () => {
    const p = new URL(build({ scope: ["ohs_verified", "email"] })).searchParams;
    expect(p.get("scope")).toBe("openid ohs_verified email");
  });

  it("url-encodes the redirect_uri", () => {
    const url = build({ redirectUri: "https://app.example.com/cb?x=1&y=2" });
    expect(url).toContain("redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb%3Fx%3D1%26y%3D2");
  });

  it("supports extraParams", () => {
    const p = new URL(build({ extraParams: { prompt: "login" } })).searchParams;
    expect(p.get("prompt")).toBe("login");
  });
});

describe("defaultEndpoints", () => {
  it("derives the live provider's path layout from the issuer", () => {
    const e = defaultEndpoints("https://pixelparents.org");
    expect(e.authorizationEndpoint).toBe("https://pixelparents.org/oauth/authorize");
    expect(e.tokenEndpoint).toBe("https://pixelparents.org/api/oauth/token");
    expect(e.jwksUri).toBe("https://pixelparents.org/.well-known/jwks.json");
  });

  it("strips a trailing slash from the issuer", () => {
    const e = defaultEndpoints("https://pixelparents.org/");
    expect(e.issuer).toBe("https://pixelparents.org");
    expect(e.tokenEndpoint).toBe("https://pixelparents.org/api/oauth/token");
  });
});
