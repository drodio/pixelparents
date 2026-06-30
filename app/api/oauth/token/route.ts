import { NextResponse } from "next/server";
import { getSignupByEmail } from "@/lib/db/signups";
import { authenticateClient, redeemAuthCode } from "@/lib/oauth/store";
import { verifyPkce } from "@/lib/oauth/pkce";
import { buildIdTokenClaims } from "@/lib/oauth/claims";
import { mintIdToken, mintAccessToken } from "@/lib/oauth/tokens";
import { issuerUrl, parseScopes, ID_TOKEN_TTL_SECONDS, ACCESS_TOKEN_TTL_SECONDS } from "@/lib/oauth/config";
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

// POST /api/oauth/token — Authorization Code + PKCE exchange. Returns a signed
// RS256 id_token (the identity assertion, incl. ohs_verified) + an access_token.
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

  if (body.get("grant_type") !== "authorization_code") {
    return err("unsupported_grant_type", "Only grant_type=authorization_code is supported.");
  }

  const code = body.get("code");
  const redirectUri = body.get("redirect_uri");
  const codeVerifier = body.get("code_verifier");
  const { clientId, clientSecret } = readClientCreds(req, body);

  if (!code) return err("invalid_request", "code is required.");
  if (!redirectUri) return err("invalid_request", "redirect_uri is required.");
  if (!codeVerifier) return err("invalid_request", "code_verifier is required (PKCE).");
  if (!clientId || !clientSecret) {
    return err("invalid_client", "client_id and client_secret are required.", 401);
  }

  // 1. Authenticate the confidential client (constant-time secret check).
  const client = await authenticateClient(clientId, clientSecret);
  if (!client) return err("invalid_client", "Client authentication failed.", 401);

  // 2. Atomically redeem the code (single-use + not-expired enforced in SQL).
  const redeemed = await redeemAuthCode(code);
  if (!redeemed) {
    return err("invalid_grant", "The authorization code is invalid, expired, or already used.");
  }

  // 3. The code must be bound to THIS client and THIS redirect_uri (exact match).
  if (redeemed.client_id !== client.client_id) {
    return err("invalid_grant", "The code was not issued to this client.");
  }
  if (redeemed.redirect_uri !== redirectUri) {
    return err("invalid_grant", "redirect_uri does not match the authorization request.");
  }

  // 4. PKCE: the presented verifier must hash to the stored challenge (S256).
  if (!verifyPkce(codeVerifier, redeemed.code_challenge)) {
    return err("invalid_grant", "PKCE verification failed.");
  }

  // 5. Resolve identity + build the consented claims (the ohs_verified product).
  const scopes = parseScopes(redeemed.scope);
  const email = redeemed.email ?? null;
  // ohs_verified is computed from the SAME verification model the directory uses.
  const signup = email ? await safeSignup(email) : null;
  const claims = buildIdTokenClaims({ scopes, email, signup });

  // 6. Mint the signed tokens. A missing/invalid signing key degrades loudly.
  try {
    const issuer = issuerUrl();
    const [idToken, accessToken] = await Promise.all([
      mintIdToken({
        issuer,
        clientId: client.client_id,
        subject: redeemed.clerk_user_id,
        nonce: redeemed.nonce,
        claims,
      }),
      mintAccessToken({
        issuer,
        clientId: client.client_id,
        subject: redeemed.clerk_user_id,
        scope: redeemed.scope,
      }),
    ]);
    return NextResponse.json(
      {
        access_token: accessToken,
        id_token: idToken,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        id_token_expires_in: ID_TOKEN_TTL_SECONDS,
        scope: redeemed.scope,
      },
      { headers: { ...CORS, "Cache-Control": "no-store", Pragma: "no-cache" } },
    );
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
async function safeSignup(email: string) {
  try {
    return await getSignupByEmail(email);
  } catch {
    return null;
  }
}
