import { describe, it, expect } from "vitest";
import { validateAuthorize, type AuthorizeParams } from "./authorize";
import { generatePkcePair } from "./pkce";
import type { OAuthClientRow } from "./store";

const { challenge } = generatePkcePair();

const client: OAuthClientRow = {
  id: "db-1",
  created_at: "2026-01-01T00:00:00Z",
  created_by: "user_1",
  name: "Cool OHS App",
  client_id: "ppc_live_abc",
  redirect_uris: ["https://app.com/callback"],
  allowed_scopes: ["openid", "email", "ohs_verified"],
  status: "active",
  secret_prefix: "ppcs_live_ab12",
  secret_rotated_at: null,
  authorization_count: 0,
  last_used_at: null,
  revoked_at: null,
};

function base(over: Partial<AuthorizeParams> = {}): AuthorizeParams {
  return {
    client_id: "ppc_live_abc",
    redirect_uri: "https://app.com/callback",
    response_type: "code",
    scope: "openid ohs_verified",
    state: "xyz",
    nonce: "abc",
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...over,
  };
}

describe("validateAuthorize", () => {
  it("accepts a well-formed request and caps to allowed scopes", () => {
    const v = validateAuthorize(base({ scope: "openid email ohs_verified" }), client);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.scopes).toEqual(["openid", "email", "ohs_verified"]);
      expect(v.codeChallenge).toBe(challenge);
      expect(v.state).toBe("xyz");
      expect(v.nonce).toBe("abc");
    }
  });

  it("FATAL: unknown client (no redirect we can trust)", () => {
    const v = validateAuthorize(base(), null);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.kind).toBe("fatal");
  });

  it("FATAL: redirect_uri not an exact match", () => {
    const v = validateAuthorize(base({ redirect_uri: "https://app.com/callback/evil" }), client);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.kind).toBe("fatal");
      expect(v.error).toBe("invalid_request");
    }
  });

  it("REDIRECT error: non-code response_type", () => {
    const v = validateAuthorize(base({ response_type: "token" }), client);
    expect(v.ok).toBe(false);
    if (!v.ok && v.kind === "redirect") {
      expect(v.error).toBe("unsupported_response_type");
      expect(v.redirectUri).toBe("https://app.com/callback");
      expect(v.state).toBe("xyz");
    } else {
      throw new Error("expected a redirect-kind error");
    }
  });

  it("REDIRECT error: PKCE missing", () => {
    const v = validateAuthorize(base({ code_challenge: null }), client);
    expect(v.ok).toBe(false);
    if (!v.ok && v.kind === "redirect") expect(v.error).toBe("invalid_request");
    else throw new Error("expected redirect error");
  });

  it("REDIRECT error: PKCE method must be S256 (reject plain downgrade)", () => {
    const v = validateAuthorize(base({ code_challenge_method: "plain" }), client);
    expect(v.ok).toBe(false);
    if (!v.ok && v.kind === "redirect") expect(v.error).toBe("invalid_request");
    else throw new Error("expected redirect error");
  });

  it("REDIRECT error: openid scope required", () => {
    const v = validateAuthorize(base({ scope: "email ohs_verified" }), client);
    expect(v.ok).toBe(false);
    if (!v.ok && v.kind === "redirect") expect(v.error).toBe("invalid_scope");
    else throw new Error("expected redirect error");
  });

  it("caps a request for a scope the client isn't allowed to use", () => {
    const restricted: OAuthClientRow = { ...client, allowed_scopes: ["openid", "email"] };
    const v = validateAuthorize(base({ scope: "openid email ohs_verified" }), restricted);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.scopes).toEqual(["openid", "email"]); // ohs_verified dropped
  });
});
