import { SignJWT } from "jose";
import { getSigningKey, SIGNING_ALG } from "./keys";
import {
  ID_TOKEN_TTL_SECONDS,
  ACCESS_TOKEN_TTL_SECONDS,
} from "./config";
import type { IdTokenClaims } from "./claims";

// Mint the signed RS256 ID token — the OIDC identity assertion. `sub` is the
// stable Clerk user id (MVP keeps a single stable subject; v1 will move to a
// pairwise per-client `sub`). `aud` is the requesting client_id. `nonce`, when
// the client supplied one, is echoed back as a claim so the client can detect
// replay (it's a custom claim, not a registered one, so we put it in the payload).
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

// Mint a short-lived RS256 access token (bearer for a future /userinfo or scoped
// Pixel Parents API call). MVP puts every claim in the ID token, so this is a
// minimal token carrying just subject/audience/scope.
export async function mintAccessToken(args: {
  issuer: string;
  clientId: string;
  subject: string;
  scope: string;
}): Promise<string> {
  const { key, kid } = await getSigningKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ scope: args.scope, token_use: "access" })
    .setProtectedHeader({ alg: SIGNING_ALG, kid, typ: "at+jwt" })
    .setIssuer(args.issuer)
    .setSubject(args.subject)
    .setAudience(args.clientId)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
    .sign(key);
}
