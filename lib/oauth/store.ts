import { getSql } from "@/lib/db";
import { ensureOAuthSchema } from "./ensure";
import {
  generateClientId,
  generateClientSecret,
  generateAuthCode,
  generateRefreshToken,
  sha256,
  verifyClientSecret,
} from "./secrets";
import { CODE_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS, type SupportedScope } from "./config";

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
  decided_at: string | null;
  decided_by: string | null;
  reject_reason: string | null;
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
  // V1: new apps start 'pending' — they go live only once the owning developer's
  // API access is approved OR an admin approves the client (see lib/oauth/gating).
  const rows = (await sql`
    INSERT INTO oauth_clients
      (created_by, name, client_id, client_secret_hash, secret_prefix, redirect_uris, allowed_scopes, status)
    VALUES
      (${input.createdBy}, ${input.name}, ${clientId}, ${hash}, ${prefix},
       ${input.redirectUris}, ${input.allowedScopes}, 'pending')
    RETURNING id, created_at, created_by, name, client_id, redirect_uris,
              allowed_scopes, status, secret_prefix, secret_rotated_at,
              authorization_count, last_used_at, revoked_at, decided_at,
              decided_by, reject_reason
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
           authorization_count, last_used_at, revoked_at, decided_at,
           decided_by, reject_reason
    FROM oauth_clients
    WHERE created_by = ${ownerId}
    ORDER BY created_at DESC
  `) as OAuthClientRow[];
}

// Every client awaiting an admin decision (status = 'pending'), newest first.
// Powers an admin "Sign-in apps" review queue (parallel to API requests).
export async function listPendingClients(): Promise<OAuthClientRow[]> {
  await ensureOAuthSchema();
  const sql = getSql();
  return (await sql`
    SELECT id, created_at, created_by, name, client_id, redirect_uris,
           allowed_scopes, status, secret_prefix, secret_rotated_at,
           authorization_count, last_used_at, revoked_at, decided_at,
           decided_by, reject_reason
    FROM oauth_clients
    WHERE status = 'pending'
    ORDER BY created_at DESC
  `) as OAuthClientRow[];
}

// Admin decision on a client. Idempotent-ish: stamps status + decided_at/by and,
// on reject, the reason. Used by the admin Sign-in-apps queue.
export async function decideClient(
  clientDbId: string,
  decision: "approved" | "rejected",
  byEmail: string,
  reason: string | null,
): Promise<void> {
  await ensureOAuthSchema();
  const sql = getSql();
  await sql`
    UPDATE oauth_clients
    SET status = ${decision}, decided_at = now(), decided_by = ${byEmail},
        reject_reason = ${decision === "rejected" ? reason : null}
    WHERE id = ${clientDbId}
  `;
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
           authorization_count, last_used_at, revoked_at, decided_at,
           decided_by, reject_reason
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
           authorization_count, last_used_at, revoked_at, decided_at,
           decided_by, reject_reason
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

// --- Refresh tokens (rotation + reuse detection) ----------------------------

// Issue the FIRST refresh token of a new grant chain (at code exchange). Returns
// the raw token (handed to the client once) and the chain id. Only the hash is
// stored. `chainId` defaults via gen_random_uuid().
export async function issueRefreshToken(input: {
  clientId: string;
  clerkUserId: string;
  email: string | null;
  scope: string;
}): Promise<string> {
  await ensureOAuthSchema();
  const sql = getSql();
  const { raw, hash } = generateRefreshToken();
  await sql`
    INSERT INTO oauth_tokens
      (refresh_token_hash, client_id, clerk_user_id, email, scope, expires_at)
    VALUES
      (${hash}, ${input.clientId}, ${input.clerkUserId}, ${input.email}, ${input.scope},
       now() + ${`${REFRESH_TOKEN_TTL_SECONDS} seconds`}::interval)
  `;
  return raw;
}

export type RefreshResult =
  | {
      ok: true;
      refreshToken: string;
      clientId: string;
      clerkUserId: string;
      email: string | null;
      scope: string;
    }
  | { ok: false; reason: "invalid" | "expired" | "reuse" };

// Rotate a refresh token. The presented token must be live (not rotated, not
// revoked, not expired) AND belong to the authenticated client. On success we mint
// a NEW token in the SAME chain, mark the old one rotated, and return the new raw
// token. REUSE DETECTION: if the presented token exists but was already rotated or
// revoked, we treat it as a stolen/replayed token and REVOKE THE ENTIRE CHAIN
// (every token of that grant), returning reason "reuse" — the standard OAuth
// refresh-token-rotation defense.
export async function rotateRefreshToken(
  rawToken: string,
  clientId: string,
): Promise<RefreshResult> {
  await ensureOAuthSchema();
  const sql = getSql();
  const hash = sha256(rawToken);

  // Look up the presented token (regardless of state) so we can distinguish
  // "unknown" from "already used → reuse".
  const rows = (await sql`
    SELECT id, chain_id, client_id, clerk_user_id, email, scope, rotated_at, revoked_at, expires_at
    FROM oauth_tokens
    WHERE refresh_token_hash = ${hash}
    LIMIT 1
  `) as Array<{
    id: string;
    chain_id: string;
    client_id: string;
    clerk_user_id: string;
    email: string | null;
    scope: string;
    rotated_at: string | null;
    revoked_at: string | null;
    expires_at: string;
  }>;
  const row = rows[0];
  if (!row) return { ok: false, reason: "invalid" };

  // Token must belong to the client presenting it.
  if (row.client_id !== clientId) return { ok: false, reason: "invalid" };

  // REUSE: an already-rotated or already-revoked token is being replayed. Burn the
  // whole chain so an attacker who stole it (and the legitimate client) both lose
  // access — they must re-authorize.
  if (row.rotated_at || row.revoked_at) {
    await sql`
      UPDATE oauth_tokens
      SET revoked_at = COALESCE(revoked_at, now())
      WHERE chain_id = ${row.chain_id} AND revoked_at IS NULL
    `;
    return { ok: false, reason: "reuse" };
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  // Rotate: mint a successor in the SAME chain, then mark this one rotated. The
  // successor inherits the chain's expiry (sliding window from first issue) — keep
  // the chain's original expiry so a refresh can't extend a grant forever; the
  // user re-authorizes after the window.
  const { raw, hash: newHash } = generateRefreshToken();
  await sql`
    INSERT INTO oauth_tokens
      (refresh_token_hash, client_id, clerk_user_id, email, scope, chain_id, expires_at)
    VALUES
      (${newHash}, ${row.client_id}, ${row.clerk_user_id}, ${row.email}, ${row.scope},
       ${row.chain_id}, ${row.expires_at})
  `;
  await sql`
    UPDATE oauth_tokens SET rotated_at = now() WHERE id = ${row.id}
  `;
  return {
    ok: true,
    refreshToken: raw,
    clientId: row.client_id,
    clerkUserId: row.clerk_user_id,
    email: row.email,
    scope: row.scope,
  };
}

// Revoke a single refresh token (RFC 7009 /revoke). Idempotent: an unknown or
// already-revoked token is a no-op success. Revokes the whole CHAIN the token
// belongs to (so revoking any token of a grant kills the grant).
export async function revokeRefreshToken(rawToken: string, clientId: string): Promise<void> {
  await ensureOAuthSchema();
  const sql = getSql();
  const hash = sha256(rawToken);
  await sql`
    UPDATE oauth_tokens
    SET revoked_at = now()
    WHERE chain_id IN (
      SELECT chain_id FROM oauth_tokens WHERE refresh_token_hash = ${hash} AND client_id = ${clientId}
    ) AND revoked_at IS NULL
  `;
}

// Revoke every refresh token for a (user, client) grant — called when the user
// revokes consent on their account page.
export async function revokeTokensForGrant(clerkUserId: string, clientId: string): Promise<void> {
  await ensureOAuthSchema();
  const sql = getSql();
  await sql`
    UPDATE oauth_tokens
    SET revoked_at = now()
    WHERE clerk_user_id = ${clerkUserId} AND client_id = ${clientId} AND revoked_at IS NULL
  `;
}

// --- Remembered consent (skip the consent screen on repeat logins) ----------

// Record (or update) the user's consent for a client at the granted scope set.
// Upserts on (clerk_user_id, client_id): re-consenting widens/updates the stored
// scope and clears any prior revocation (a fresh grant). Bumps last_used_at.
export async function recordConsent(
  clerkUserId: string,
  clientId: string,
  scope: string,
): Promise<void> {
  await ensureOAuthSchema();
  const sql = getSql();
  await sql`
    INSERT INTO oauth_consents (clerk_user_id, client_id, scope, last_used_at)
    VALUES (${clerkUserId}, ${clientId}, ${scope}, now())
    ON CONFLICT (clerk_user_id, client_id)
    DO UPDATE SET scope = EXCLUDED.scope, updated_at = now(),
                  last_used_at = now(), revoked_at = NULL
  `;
}

// The live consent for a (user, client), or null if none / revoked. Used to decide
// whether to SKIP the consent screen: we skip only when a live consent covers
// (is a superset of) the currently-requested scopes.
export async function getConsent(
  clerkUserId: string,
  clientId: string,
): Promise<{ scope: string } | null> {
  await ensureOAuthSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT scope FROM oauth_consents
    WHERE clerk_user_id = ${clerkUserId} AND client_id = ${clientId} AND revoked_at IS NULL
    LIMIT 1
  `) as Array<{ scope: string }>;
  return rows[0] ?? null;
}

// Best-effort: bump a consent's last_used_at when it's exercised on a repeat login.
export async function touchConsent(clerkUserId: string, clientId: string): Promise<void> {
  await ensureOAuthSchema();
  const sql = getSql();
  await sql`
    UPDATE oauth_consents SET last_used_at = now()
    WHERE clerk_user_id = ${clerkUserId} AND client_id = ${clientId} AND revoked_at IS NULL
  `;
}

export type ConnectedApp = {
  client_id: string;
  name: string;
  scope: string;
  created_at: string;
  last_used_at: string | null;
};

// The user's live connected apps (for the account-page "Connected apps" panel):
// every non-revoked consent joined to its client, newest-used first.
export async function listConsentsForUser(clerkUserId: string): Promise<ConnectedApp[]> {
  await ensureOAuthSchema();
  const sql = getSql();
  return (await sql`
    SELECT c.client_id, COALESCE(cl.name, c.client_id) AS name, c.scope,
           c.created_at, c.last_used_at
    FROM oauth_consents c
    LEFT JOIN oauth_clients cl ON cl.client_id = c.client_id
    WHERE c.clerk_user_id = ${clerkUserId} AND c.revoked_at IS NULL
    ORDER BY COALESCE(c.last_used_at, c.created_at) DESC
  `) as ConnectedApp[];
}

// Revoke a user's consent for a client AND all that grant's refresh tokens (the
// account-page Revoke button). Verifies ownership implicitly: the WHERE is keyed
// on the caller's clerk_user_id. Returns true if a consent row was revoked.
export async function revokeConsent(clerkUserId: string, clientId: string): Promise<boolean> {
  await ensureOAuthSchema();
  const sql = getSql();
  const rows = (await sql`
    UPDATE oauth_consents
    SET revoked_at = now()
    WHERE clerk_user_id = ${clerkUserId} AND client_id = ${clientId} AND revoked_at IS NULL
    RETURNING id
  `) as Array<{ id: string }>;
  // Also burn every refresh token for this grant.
  await revokeTokensForGrant(clerkUserId, clientId);
  return rows.length > 0;
}
