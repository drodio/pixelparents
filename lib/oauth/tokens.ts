import { SignJWT, jwtVerify } from "jose";
import { getSigningKey, getVerifyKey, SIGNING_ALG } from "./keys";
import {
  ID_TOKEN_TTL_SECONDS,
  ACCESS_TOKEN_TTL_SECONDS,
} from "./config";
import type { IdTokenClaims } from "./claims";

// Mint the signed RS256 ID token — the OIDC identity assertion. `sub` is the
// PAIRWISE per-client subject (lib/oauth/secrets.ts:pairwiseSub) — the caller
// passes the already-derived value, so the same user gets a different `sub` in two
// different apps and apps can't collude to correlate them. `aud` is the requesting
// client_id. `nonce`, when the client supplied one, is echoed back as a claim so
// the client can detect replay (a custom claim, so we put it in the payload).
export async function mintIdToken(args: {
  issuer: string;
  clientId: string;
  subject: string;
  nonce?: string | null;
  claims: IdTokenClaims;
}): Promise<string> {
  const { key, kid } = await getSigningKey();
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = { ...args.claims };
  if (args.nonce) payload.nonce = args.nonce;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: SIGNING_ALG, kid, typ: "JWT" })
    .setIssuer(args.issuer)
    .setSubject(args.subject)
    .setAudience(args.clientId)
    .setIssuedAt(now)
    .setExpirationTime(now + ID_TOKEN_TTL_SECONDS)
    .sign(key);
}

// Mint a short-lived RS256 access token (bearer for /userinfo or a future scoped
// GoPixel API call). Carries `scope` (so /userinfo emits only consented
// claims) and a PRIVATE `pp_email` claim (so /userinfo can rebuild the verified-
// identity claims for the user). We deliberately do NOT embed the global Clerk
// user id — the subject is the PAIRWISE id, keeping the token free of any cross-app
// correlator. `pp_email` is only the user's own email, which the holding client
// already receives via the ID token when the `email` scope was granted.
export async function mintAccessToken(args: {
  issuer: string;
  clientId: string;
  subject: string;
  scope: string;
  email?: string | null;
}): Promise<string> {
  const { key, kid } = await getSigningKey();
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = { scope: args.scope, token_use: "access" };
  if (args.email) payload.pp_email = args.email;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: SIGNING_ALG, kid, typ: "at+jwt" })
    .setIssuer(args.issuer)
    .setSubject(args.subject)
    .setAudience(args.clientId)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
    .sign(key);
}

// Verify an access token we minted (RS256, our key) for /userinfo. Returns the
// decoded subject/scope/email or null on any failure (expired, bad sig, wrong typ).
export async function verifyAccessToken(token: string): Promise<{
  sub: string;
  aud: string;
  scope: string;
  email: string | null;
} | null> {
  try {
    const verifyKey = await getVerifyKey();
    const { payload, protectedHeader } = await jwtVerify(token, verifyKey, {
      algorithms: [SIGNING_ALG],
    });
    if (protectedHeader.alg !== SIGNING_ALG) return null;
    if (payload.token_use !== "access") return null;
    const aud = typeof payload.aud === "string" ? payload.aud : Array.isArray(payload.aud) ? payload.aud[0] : "";
    return {
      sub: String(payload.sub ?? ""),
      aud: aud ?? "",
      scope: typeof payload.scope === "string" ? payload.scope : "",
      email: typeof payload.pp_email === "string" ? payload.pp_email : null,
    };
  } catch {
    return null;
  }
}
