import { getSql } from "@/lib/db";

// Self-contained, self-healing DDL for the "Sign in with Pixel Parents" OIDC
// provider. SAME rationale as lib/admin.ts:ensureAdminsTable and
// lib/db/ensure.ts:ensureApiKeysTable — this app shares one Neon database across
// features, there is NO migrate-on-deploy, and a sibling `drizzle-kit push` from
// a partial schema could DROP a table it doesn't know about. So rather than touch
// the shared lib/db/ensure.ts or the Drizzle schema index, the OAuth feature owns
// its own idempotent DDL here and calls it on EVERY read/write path (the
// country-column P0 lesson: new tables must self-heal AND read paths must invoke
// the ensure). Statements are idempotent and run in ONE round-trip per cold start.
//
// Tables:
//   oauth_clients  — the registered third-party apps (client_id + hashed secret +
//                    exact-match redirect_uris allowlist + owner + lifecycle +
//                    admin-approval status gate).
//   oauth_codes    — short-lived (≈60s) single-use authorization codes, bound to
//                    client_id + redirect_uri + PKCE code_challenge + the
//                    authenticated user. We store only the SHA-256 of the raw code.
//   oauth_tokens   — refresh tokens (hashed, rotated on use, reuse-detected) +
//                    the live grant record. Access/ID tokens stay stateless JWTs.
//   oauth_consents — remembered grants per (user, client) so repeat logins skip
//                    the consent screen until the user revokes (account page).

let ensured: Promise<void> | null = null;

export function ensureOAuthSchema(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const sql = getSql();
      await sql.transaction([
        sql`
        CREATE TABLE IF NOT EXISTS oauth_clients (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at timestamptz NOT NULL DEFAULT now(),
          created_by text,
          name text NOT NULL,
          client_id text UNIQUE NOT NULL,
          client_secret_hash text NOT NULL,
          secret_prefix text,
          redirect_uris text[] NOT NULL DEFAULT '{}',
          allowed_scopes text[] NOT NULL DEFAULT '{openid,email,ohs_verified}',
          status text NOT NULL DEFAULT 'active',
          secret_rotated_at timestamptz,
          authorization_count integer NOT NULL DEFAULT 0,
          last_used_at timestamptz,
          revoked_at timestamptz
        )
      `,
        sql`
        CREATE TABLE IF NOT EXISTS oauth_codes (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at timestamptz NOT NULL DEFAULT now(),
          code_hash text UNIQUE NOT NULL,
          client_id text NOT NULL,
          redirect_uri text NOT NULL,
          code_challenge text NOT NULL,
          code_challenge_method text NOT NULL DEFAULT 'S256',
          scope text NOT NULL,
          clerk_user_id text NOT NULL,
          email text,
          nonce text,
          expires_at timestamptz NOT NULL,
          used boolean NOT NULL DEFAULT false,
          used_at timestamptz
        )
      `,
        sql`
        CREATE TABLE IF NOT EXISTS oauth_tokens (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at timestamptz NOT NULL DEFAULT now(),
          refresh_token_hash text UNIQUE NOT NULL,
          client_id text NOT NULL,
          clerk_user_id text NOT NULL,
          email text,
          scope text NOT NULL,
          -- The chain id ties every rotation of one grant together so reuse of any
          -- rotated token can revoke the WHOLE chain (reuse detection).
          chain_id uuid NOT NULL DEFAULT gen_random_uuid(),
          rotated_at timestamptz,
          expires_at timestamptz NOT NULL,
          revoked_at timestamptz
        )
      `,
        sql`
        CREATE TABLE IF NOT EXISTS oauth_consents (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          clerk_user_id text NOT NULL,
          client_id text NOT NULL,
          scope text NOT NULL,
          last_used_at timestamptz,
          revoked_at timestamptz,
          UNIQUE (clerk_user_id, client_id)
        )
      `,
        // Idempotent upgrades for an older shape (mirrors the ALTER pattern used
        // by ensureApiKeysTable / ensureAsksSchema).
        sql`ALTER TABLE oauth_clients ADD COLUMN IF NOT EXISTS secret_prefix text`,
        sql`ALTER TABLE oauth_clients ADD COLUMN IF NOT EXISTS allowed_scopes text[] NOT NULL DEFAULT '{openid,email,ohs_verified}'`,
        sql`ALTER TABLE oauth_clients ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'`,
        sql`ALTER TABLE oauth_clients ADD COLUMN IF NOT EXISTS secret_rotated_at timestamptz`,
        sql`ALTER TABLE oauth_clients ADD COLUMN IF NOT EXISTS authorization_count integer NOT NULL DEFAULT 0`,
        sql`ALTER TABLE oauth_clients ADD COLUMN IF NOT EXISTS last_used_at timestamptz`,
        sql`ALTER TABLE oauth_clients ADD COLUMN IF NOT EXISTS revoked_at timestamptz`,
        // V1 admin-approval gate: which admin decided + when + why (for the dev's
        // status surface). `approved_by_owner_at` records that the gate was
        // satisfied implicitly because the owning developer's API access was
        // approved (vs. an explicit per-client admin approval).
        sql`ALTER TABLE oauth_clients ADD COLUMN IF NOT EXISTS decided_at timestamptz`,
        sql`ALTER TABLE oauth_clients ADD COLUMN IF NOT EXISTS decided_by text`,
        sql`ALTER TABLE oauth_clients ADD COLUMN IF NOT EXISTS reject_reason text`,
        sql`ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS email text`,
        sql`ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS email text`,
        sql`ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS nonce text`,
        sql`ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS used boolean NOT NULL DEFAULT false`,
        sql`ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS used_at timestamptz`,
        // Lookup indexes: clients by owner (the developer dashboard list), a
        // sweepable index over code expiry (cleanup of stale/used codes), refresh
        // tokens by chain (reuse-detection revocation), and consents by user (the
        // account-page Connected-apps list).
        sql`CREATE INDEX IF NOT EXISTS oauth_clients_created_by_idx ON oauth_clients (created_by)`,
        sql`CREATE INDEX IF NOT EXISTS oauth_codes_expires_idx ON oauth_codes (expires_at)`,
        sql`CREATE INDEX IF NOT EXISTS oauth_tokens_chain_idx ON oauth_tokens (chain_id)`,
        sql`CREATE INDEX IF NOT EXISTS oauth_tokens_user_client_idx ON oauth_tokens (clerk_user_id, client_id)`,
        sql`CREATE INDEX IF NOT EXISTS oauth_consents_user_idx ON oauth_consents (clerk_user_id)`,
      ]);
    })().catch((e) => {
      // Reset so a transient failure (e.g. a concurrent DDL race) retries on the
      // next call rather than caching the rejection forever.
      ensured = null;
      throw e;
    });
  }
  return ensured;
}
