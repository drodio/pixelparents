import { getSql } from "@/lib/db";
import { ensureOAuthSchema } from "./ensure";
import {
  generateClientId,
  generateClientSecret,
  generateAuthCode,
  sha256,
  verifyClientSecret,
} from "./secrets";
import { CODE_TTL_SECONDS, type SupportedScope } from "./config";

// DB access for the OIDC provider. Every read/write self-heals the schema first
// (the country-column P0 lesson). Uses the raw Neon `sql` tagged template (like
// lib/approval.ts) rather than Drizzle, since these tables live entirely in this
// feature and aren't in the shared Drizzle schema index.

export type OAuthClientRow = {
  id: string;
  created_at: string;
  created_by: string | null;
  name: string;
  client_id: string;
  redirect_uris: string[];
  allowed_scopes: string[];
  status: string;
  secret_prefix: string | null;
  secret_rotated_at: string | null;
  authorization_count: number;
  last_used_at: string | null;
  revoked_at: string | null;
};

// --- Client registration / management (Developers tab) ---

// Register a new connected app. Generates a client_id + a one-time client_secret
// (only the hash is stored). Returns the row plus the raw secret to reveal ONCE.
export async function registerClient(input: {
  name: string;
  redirectUris: string[];
  allowedScopes: SupportedScope[];
  createdBy: string | null;
}): Promise<{ client: OAuthClientRow; clientSecret: string }> {
  await ensureOAuthSchema();
  const sql = getSql();
  const clientId = generateClientId();
  const { raw, hash, prefix } = generateClientSecret();
  const rows = (await sql`
    INSERT INTO oauth_clients
      (created_by, name, client_id, client_secret_hash, secret_prefix, redirect_uris, allowed_scopes, status)
    VALUES
      (${input.createdBy}, ${input.name}, ${clientId}, ${hash}, ${prefix},
       ${input.redirectUris}, ${input.allowedScopes}, 'active')
    RETURNING id, created_at, created_by, name, client_id, redirect_uris,
              allowed_scopes, status, secret_prefix, secret_rotated_at,
              authorization_count, last_used_at, revoked_at
  `) as OAuthClientRow[];
  return { client: rows[0]!, clientSecret: raw };
}

// All apps owned by a given developer (their Clerk user id), newest first.
export async function listClientsByOwner(ownerId: string): Promise<OAuthClientRow[]> {
  await ensureOAuthSchema();
  const sql = getSql();
  return (await sql`
    SELECT id, created_at, created_by, name, client_id, redirect_uris,
           allowed_scopes, status, secret_prefix, secret_rotated_at,
           authorization_count, last_used_at, revoked_at
    FROM oauth_clients
    WHERE created_by = ${ownerId}
    ORDER BY created_at DESC
  `) as OAuthClientRow[];
}

// Rotate the secret for an app the caller owns. Returns the new raw secret once,
// or null if the app doesn't exist / isn't owned by the caller / is revoked.
export async function rotateClientSecret(
  clientDbId: string,
  ownerId: string,
): Promise<string | null> {
  await ensureOAuthSchema();
  const sql = getSql();
  const { raw, hash, prefix } = generateClientSecret();
  const rows = (await sql`
    UPDATE oauth_clients
    SET client_secret_hash = ${hash}, secret_prefix = ${prefix}, secret_rotated_at = now()
    WHERE id = ${clientDbId} AND created_by = ${ownerId} AND revoked_at IS NULL
    RETURNING id
  `) as Array<{ id: string }>;
  return rows.length > 0 ? raw : null;
}

// Look up an active client by its public client_id (used at /authorize).
export async function getClientByClientId(clientId: string): Promise<OAuthClientRow | null> {
  await ensureOAuthSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id, created_at, created_by, name, client_id, redirect_uris,
           allowed_scopes, status, secret_prefix, secret_rotated_at,
           authorization_count, last_used_at, revoked_at
    FROM oauth_clients
    WHERE client_id = ${clientId} AND revoked_at IS NULL
    LIMIT 1
  `) as OAuthClientRow[];
  return rows[0] ?? null;
}

// Verify a confidential client at the token endpoint: client_id must exist and
// the presented secret must match the stored hash. Returns the client on success.
export async function authenticateClient(
  clientId: string,
  clientSecret: string,
): Promise<OAuthClientRow | null> {
  await ensureOAuthSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id, created_at, created_by, name, client_id, client_secret_hash,
           redirect_uris, allowed_scopes, status, secret_prefix, secret_rotated_at,
           authorization_count, last_used_at, revoked_at
    FROM oauth_clients
    WHERE client_id = ${clientId} AND revoked_at IS NULL
    LIMIT 1
  `) as Array<OAuthClientRow & { client_secret_hash: string }>;
  const row = rows[0];
  if (!row) return null;
  if (!verifyClientSecret(clientSecret, row.client_secret_hash)) return null;
  // Strip the hash before returning.
  const { client_secret_hash: _omit, ...safe } = row;
  void _omit;
  return safe;
}

// --- Authorization codes (issue at /authorize, redeem at /token) ---

// Issue a single-use auth code bound to the client, redirect URI, PKCE challenge,
// scope, and authenticated user. Returns the RAW code to put in the redirect; we
// persist only its hash. Also bumps the client's authorization counter.
export async function issueAuthCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  clerkUserId: string;
  email: string | null;
  nonce: string | null;
}): Promise<string> {
  await ensureOAuthSchema();
  const sql = getSql();
  const { raw, hash } = generateAuthCode();
  await sql`
    INSERT INTO oauth_codes
      (code_hash, client_id, redirect_uri, code_challenge, code_challenge_method,
       scope, clerk_user_id, email, nonce, expires_at, used)
    VALUES
      (${hash}, ${input.clientId}, ${input.redirectUri}, ${input.codeChallenge}, 'S256',
       ${input.scope}, ${input.clerkUserId}, ${input.email}, ${input.nonce},
       now() + ${`${CODE_TTL_SECONDS} seconds`}::interval, false)
  `;
  await sql`
    UPDATE oauth_clients
    SET authorization_count = authorization_count + 1, last_used_at = now()
    WHERE client_id = ${input.clientId}
  `;
  return raw;
}

export type RedeemedCode = {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  clerk_user_id: string;
  email: string | null;
  nonce: string | null;
};

// Atomically redeem an auth code: marks it used and returns its bound data ONLY
// if it exists, hasn't been used, and hasn't expired. The single UPDATE...
// WHERE used = false ... RETURNING is the concurrency guard — a second redeem of
// the same code updates 0 rows and gets null (single-use enforced in SQL, not in
// app logic). The caller still checks client_id + redirect_uri + PKCE match.
export async function redeemAuthCode(rawCode: string): Promise<RedeemedCode | null> {
  await ensureOAuthSchema();
  const sql = getSql();
  const hash = sha256(rawCode);
  const rows = (await sql`
    UPDATE oauth_codes
    SET used = true, used_at = now()
    WHERE code_hash = ${hash} AND used = false AND expires_at > now()
    RETURNING client_id, redirect_uri, code_challenge, scope, clerk_user_id, email, nonce
  `) as RedeemedCode[];
  return rows[0] ?? null;
}
