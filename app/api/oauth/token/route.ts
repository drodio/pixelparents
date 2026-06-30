import { NextResponse } from "next/server";
import { getSignupByEmail, getFamilyForEmail } from "@/lib/db/signups";
import { verifiedEmailsOf } from "@/lib/verify";
import {
  authenticateClient,
  redeemAuthCode,
  issueRefreshToken,
  rotateRefreshToken,
} from "@/lib/oauth/store";
import { isClientLive } from "@/lib/oauth/gating";
import { ownerApiAccessApproved } from "@/lib/oauth/owner-approval";
import { verifyPkce } from "@/lib/oauth/pkce";
import { buildIdTokenClaims, candidateGradesForStudent, type SignupForClaims } from "@/lib/oauth/claims";
import { mintIdToken, mintAccessToken } from "@/lib/oauth/tokens";
import { pairwiseSub } from "@/lib/oauth/secrets";
import {
  issuerUrl,
  parseScopes,
  ID_TOKEN_TTL_SECONDS,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "@/lib/oauth/config";
import { OAuthKeyError } from "@/lib/oauth/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function err(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { ...CORS, "Cache-Control": "no-store" } },
  );
}

// Read client credentials from either client_secret_post (body) or
// client_secret_basic (Authorization: Basic base64(id:secret)).
function readClientCreds(
  req: Request,
  body: URLSearchParams,
): { clientId: string | null; clientSecret: string | null } {
  const authz = req.headers.get("authorization");
  if (authz?.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = Buffer.from(authz.slice(6).trim(), "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      if (idx >= 0) {
        return {
          clientId: decodeURIComponent(decoded.slice(0, idx)),
          clientSecret: decodeURIComponent(decoded.slice(idx + 1)),
        };
      }
    } catch {
      /* fall through to body */
    }
  }
  return {
    clientId: body.get("client_id"),
    clientSecret: body.get("client_secret"),
  };
}

// POST /api/oauth/token — Authorization Code + PKCE exchange OR refresh_token
// rotation. Returns a signed RS256 id_token (the identity assertion, incl.
// ohs_verified) + an access_token + a rotating refresh_token.
export async function POST(req: Request) {
  let body: URLSearchParams;
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/x-www-form-urlencoded")) {
      body = new URLSearchParams(await req.text());
    } else if (ct.includes("application/json")) {
      const json = (await req.json()) as Record<string, string>;
      body = new URLSearchParams(json);
    } else {
      body = new URLSearchParams(await req.text());
    }
  } catch {
    return err("invalid_request", "Could not parse the request body.");
  }

  const grantType = body.get("grant_type");
  const { clientId, clientSecret } = readClientCreds(req, body);
  if (!clientId || !clientSecret) {
    return err("invalid_client", "client_id and client_secret are required.", 401);
  }

  // Authenticate the confidential client (constant-time secret check) — shared by
  // both grant types.
  const client = await authenticateClient(clientId, clientSecret);
  if (!client) return err("invalid_client", "Client authentication failed.", 401);

  // APPROVAL GATE: a non-live (pending/rejected) app can't mint tokens even if it
  // somehow holds a code or refresh token. Enforced here independently of
  // /authorize.
  const ownerApproved = await ownerApiAccessApproved(client.created_by);
  if (!isClientLive(client, ownerApproved)) {
    return err("invalid_client", "This app is not approved to issue tokens.", 403);
  }

  if (grantType === "refresh_token") {
    return handleRefresh(body, client.client_id);
  }
  if (grantType === "authorization_code") {
    return handleAuthCode(body, client.client_id);
  }
  return err(
    "unsupported_grant_type",
    "Only grant_type=authorization_code and refresh_token are supported.",
  );
}

async function handleAuthCode(body: URLSearchParams, authedClientId: string) {
  const code = body.get("code");
  const redirectUri = body.get("redirect_uri");
  const codeVerifier = body.get("code_verifier");

  if (!code) return err("invalid_request", "code is required.");
  if (!redirectUri) return err("invalid_request", "redirect_uri is required.");
  if (!codeVerifier) return err("invalid_request", "code_verifier is required (PKCE).");

  // Atomically redeem the code (single-use + not-expired enforced in SQL).
  const redeemed = await redeemAuthCode(code);
  if (!redeemed) {
    return err("invalid_grant", "The authorization code is invalid, expired, or already used.");
  }

  // The code must be bound to THIS client and THIS redirect_uri (exact match).
  if (redeemed.client_id !== authedClientId) {
    return err("invalid_grant", "The code was not issued to this client.");
  }
  if (redeemed.redirect_uri !== redirectUri) {
    return err("invalid_grant", "redirect_uri does not match the authorization request.");
  }

  // PKCE: the presented verifier must hash to the stored challenge (S256).
  if (!verifyPkce(codeVerifier, redeemed.code_challenge)) {
    return err("invalid_grant", "PKCE verification failed.");
  }

  return issueTokenSet({
    clientId: authedClientId,
    clerkUserId: redeemed.clerk_user_id,
    scope: redeemed.scope,
    email: redeemed.email ?? null,
    nonce: redeemed.nonce,
    withRefresh: true,
  });
}

async function handleRefresh(body: URLSearchParams, authedClientId: string) {
  const refreshToken = body.get("refresh_token");
  if (!refreshToken) return err("invalid_request", "refresh_token is required.");

  // Rotate: validates the token, detects reuse (→ chain revoked), and on success
  // returns a NEW refresh token + the grant's user/scope.
  const result = await rotateRefreshToken(refreshToken, authedClientId);
  if (!result.ok) {
    if (result.reason === "reuse") {
      // Reuse detected: the whole chain is now revoked. Tell the client the grant
      // is dead so it re-authorizes.
      return err("invalid_grant", "Refresh token reuse detected; the grant has been revoked.");
    }
    return err("invalid_grant", "The refresh token is invalid or expired.");
  }

  // The grant stores the user's email so scope-gated claims (email/ohs_verified/
  // role/grade_band) stay CURRENT on refresh — e.g. ohs_verified flips to true once
  // the family verifies, without re-authorizing. nonce is omitted on refresh (no
  // fresh auth event). The rotated refresh token is returned as-is.
  return issueTokenSet({
    clientId: authedClientId,
    clerkUserId: result.clerkUserId,
    scope: result.scope,
    email: result.email,
    nonce: null,
    withRefresh: false,
    rotatedRefreshToken: result.refreshToken,
  });
}

// Build claims for a user and mint the token set. `email` may be null on a refresh
// (we then can't resolve the signup, so verified/role/grade claims fall back to
// "unverified"/absent — acceptable: a relying app that needs fresh PII should use
// /userinfo, and the ID token is primarily an auth event). When `email` is present
// (auth-code path) we resolve the signup + family for the full claim set.
async function issueTokenSet(args: {
  clientId: string;
  clerkUserId: string;
  scope: string;
  email: string | null;
  nonce: string | null;
  withRefresh: boolean;
  rotatedRefreshToken?: string;
}) {
  const scopes = parseScopes(args.scope);

  // Resolve identity for claims. ohs_verified/role/grade are computed from the
  // SAME model the directory uses; a DB hiccup → null signup → no false positives.
  let signup: SignupForClaims | null = null;
  let childGrades: Array<string | null> = [];
  if (args.email) {
    signup = await safeSignup(args.email);
    // For a student subject needing grade_band, resolve the family's children +
    // their own verified emails so we band THEIR grade (never a sibling's, never
    // an exact value).
    if (signup && scopes.includes("grade_band")) {
      try {
        const fam = await getFamilyForEmail(args.email);
        if (fam) {
          const verified = verifiedEmailsOf((signup.extra ?? {}) as Record<string, unknown>);
          childGrades = candidateGradesForStudent(
            signup,
            fam.kids.map((k) => ({ grade: k.grade, studentEmail: k.studentEmail })),
            verified,
          );
        }
      } catch {
        /* best-effort; omit grade_band on a lookup failure */
      }
    }
  }

  const claims = buildIdTokenClaims({
    scopes,
    clientId: args.clientId,
    email: args.email,
    signup,
    childGrades,
  });

  // Pairwise per-client subject: same user → different sub in different apps.
  const subject = pairwiseSub(args.clientId, args.clerkUserId);

  try {
    const issuer = issuerUrl();
    const [idToken, accessToken, refreshToken] = await Promise.all([
      mintIdToken({ issuer, clientId: args.clientId, subject, nonce: args.nonce, claims }),
      mintAccessToken({ issuer, clientId: args.clientId, subject, scope: args.scope, email: args.email }),
      args.withRefresh
        ? issueRefreshToken({
            clientId: args.clientId,
            clerkUserId: args.clerkUserId,
            email: args.email,
            scope: args.scope,
          })
        : Promise.resolve(args.rotatedRefreshToken ?? null),
    ]);

    const payload: Record<string, unknown> = {
      access_token: accessToken,
      id_token: idToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      id_token_expires_in: ID_TOKEN_TTL_SECONDS,
      scope: args.scope,
    };
    if (refreshToken) {
      payload.refresh_token = refreshToken;
      payload.refresh_token_expires_in = REFRESH_TOKEN_TTL_SECONDS;
    }
    return NextResponse.json(payload, {
      headers: { ...CORS, "Cache-Control": "no-store", Pragma: "no-cache" },
    });
  } catch (e) {
    if (e instanceof OAuthKeyError) {
      return err("provider_not_configured", e.message, 503);
    }
    throw e;
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// Tolerate a DB hiccup when resolving the signup: a failed lookup must NOT mint a
// false-positive verified claim, so we treat it as "no signup" (→ not verified).
async function safeSignup(email: string): Promise<SignupForClaims | null> {
  try {
    return await getSignupByEmail(email);
  } catch {
    return null;
  }
}
