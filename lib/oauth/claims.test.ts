import { describe, it, expect } from "vitest";
import { buildIdTokenClaims, isOhsVerified } from "./claims";
import type { SignupForClaims } from "./claims";

// A signup created comfortably after the grandfather cutoff (VERIFICATION_CUTOFF
// = 2026-08-01) so verification depends ONLY on approvalStatus, not the date.
const POST_CUTOFF = new Date("2026-09-01T00:00:00Z");
// One created before the cutoff → grandfathered-verified regardless of status.
const PRE_CUTOFF = new Date("2025-01-01T00:00:00Z");

function signup(extra: Record<string, unknown>, createdAt = POST_CUTOFF): SignupForClaims {
  return { extra, createdAt } as SignupForClaims;
}

describe("ohs_verified claim", () => {
  it("is true for an approved signup", () => {
    expect(isOhsVerified(signup({ approvalStatus: "approved" }))).toBe(true);
  });

  it("is false for a pending/denied post-cutoff signup", () => {
    expect(isOhsVerified(signup({ approvalStatus: "pending" }))).toBe(false);
    expect(isOhsVerified(signup({ approvalStatus: "denied" }))).toBe(false);
    expect(isOhsVerified(signup({}))).toBe(false);
  });

  it("is true for a grandfathered pre-cutoff signup even without approval", () => {
    expect(isOhsVerified(signup({}, PRE_CUTOFF))).toBe(true);
  });

  it("is false when the user has NO signup (Clerk-only, not a PP member)", () => {
    expect(isOhsVerified(null)).toBe(false);
    expect(isOhsVerified(undefined)).toBe(false);
  });
});

const CLIENT = "ppc_live_test";

describe("buildIdTokenClaims — scope-gated emission", () => {
  it("emits ohs_verified only when the scope is consented", () => {
    const s = signup({ approvalStatus: "approved" });
    const withScope = buildIdTokenClaims({ scopes: ["openid", "ohs_verified"], clientId: CLIENT, email: "a@b.com", signup: s });
    expect(withScope.ohs_verified).toBe(true);

    const withoutScope = buildIdTokenClaims({ scopes: ["openid"], clientId: CLIENT, email: "a@b.com", signup: s });
    expect(withoutScope.ohs_verified).toBeUndefined();
  });

  it("emits a false ohs_verified for an unverified user (no false positives)", () => {
    const claims = buildIdTokenClaims({
      scopes: ["openid", "ohs_verified"],
      clientId: CLIENT,
      email: "x@y.com",
      signup: signup({ approvalStatus: "pending" }),
    });
    expect(claims.ohs_verified).toBe(false);
  });

  it("emits email only when the email scope is consented and an email exists", () => {
    const s = signup({ approvalStatus: "approved" });
    const withEmail = buildIdTokenClaims({ scopes: ["openid", "email"], clientId: CLIENT, email: "a@b.com", signup: s });
    expect(withEmail.email).toBe("a@b.com");
    expect(withEmail.email_verified).toBe(true);

    const noScope = buildIdTokenClaims({ scopes: ["openid"], clientId: CLIENT, email: "a@b.com", signup: s });
    expect(noScope.email).toBeUndefined();

    const noEmail = buildIdTokenClaims({ scopes: ["openid", "email"], clientId: CLIENT, email: null, signup: s });
    expect(noEmail.email).toBeUndefined();
  });
});
