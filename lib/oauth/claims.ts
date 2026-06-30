import { isFamilyVerified } from "@/lib/directory";
import type { SignupRow } from "@/lib/db/schema/signups";
import type { SupportedScope } from "./config";

// Build the OIDC ID-token claim set from the authenticated user's Pixel Parents
// signup and the scopes they consented to. This is where the product lives:
// `ohs_verified` is a SIGNED assertion that the user is a verified Stanford OHS
// member, computed from the SAME verification model the directory uses
// (lib/directory.ts:isFamilyVerified → extra.approvalStatus === "approved" OR a
// grandfathered pre-cutoff signup). We READ that model; we never re-implement the
// rule, so the assertion can't drift from what the rest of the app considers
// "verified".
//
// Privacy by default: a claim is emitted ONLY when its scope was both requested
// AND consented to. No scope ⇒ no claim. `email` rides the `email` scope;
// `ohs_verified` rides the `ohs_verified` scope. The minimal/common case — an app
// that only wants the membership signal — gets `ohs_verified` and nothing else.

// Just the slice of a signup the claim builder needs. SignupRow satisfies this;
// keeping it narrow lets tests pass a tiny fixture.
export type SignupForClaims = Pick<SignupRow, "extra" | "createdAt">;

export type IdTokenClaims = {
  email?: string;
  email_verified?: boolean;
  ohs_verified?: boolean;
};

// Compute whether this user is a verified OHS member. A null signup (the user
// authenticated via Clerk but has no Pixel Parents signup on file) is NOT
// verified — the assertion must be backed by a real, approved/grandfathered row.
export function isOhsVerified(signup: SignupForClaims | null | undefined): boolean {
  if (!signup) return false;
  return isFamilyVerified(signup);
}

// Project the consented scopes into the additional ID-token claims (the standard
// `sub`/`iss`/`aud`/`exp`/`iat`/`nonce` are added by the signer, not here).
export function buildIdTokenClaims(args: {
  scopes: readonly SupportedScope[];
  email: string | null;
  signup: SignupForClaims | null;
}): IdTokenClaims {
  const claims: IdTokenClaims = {};
  const scopes = new Set(args.scopes);

  if (scopes.has("email") && args.email) {
    claims.email = args.email;
    // Clerk only surfaces verified primary emails for sign-in, so the email we
    // hold for a signed-in user is a confirmed address.
    claims.email_verified = true;
  }

  if (scopes.has("ohs_verified")) {
    claims.ohs_verified = isOhsVerified(args.signup);
  }

  return claims;
}
