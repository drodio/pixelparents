import { getSql } from "./index";

// Self-healing + self-migrating guard for the api_keys table.
//
// This app shares one Neon database with other features (signup, etc.). Until
// every feature is consolidated onto a single Drizzle schema + migration flow,
// another feature running `drizzle-kit push` from its own partial schema could
// see api_keys as an orphan and DROP it. Rather than let the API break until a
// human re-runs a migration, we ensure the table exists AND has the current
// columns (idempotently) on the first key operation per cold start.
//
// Statements mirror lib/db/schema/api-keys.ts. CREATE handles a dropped table;
// the ALTERs upgrade an older table in place. All are idempotent.

let ensured: Promise<void> | null = null;

export function ensureApiKeysTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const sql = getSql();
      // Fresh table (post-drop): create with the full current shape.
      await sql`
        CREATE TABLE IF NOT EXISTS api_keys (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at timestamptz NOT NULL DEFAULT now(),
          clerk_user_id text,
          name text NOT NULL,
          email text NOT NULL,
          intended_use text NOT NULL,
          status text NOT NULL DEFAULT 'pending',
          decided_at timestamptz,
          decided_by text,
          reject_reason text,
          key_hash text UNIQUE,
          key_prefix text,
          revealed_at timestamptz,
          revoked_at timestamptz,
          last_used_at timestamptz,
          tier text,
          label text,
          approved_at timestamptz
        )
      `;
      // Upgrade an existing (older) table in place — each is a no-op if already applied.
      await sql`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS clerk_user_id text`;
      await sql`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'`;
      await sql`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS decided_at timestamptz`;
      await sql`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS decided_by text`;
      await sql`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS reject_reason text`;
      await sql`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revealed_at timestamptz`;
      // Keys no longer exist at request time, so these must be nullable.
      await sql`ALTER TABLE api_keys ALTER COLUMN key_hash DROP NOT NULL`;
      await sql`ALTER TABLE api_keys ALTER COLUMN key_prefix DROP NOT NULL`;
      // Legacy `tier` was NOT NULL DEFAULT 'public'; relax it (one gate now).
      await sql`ALTER TABLE api_keys ALTER COLUMN tier DROP NOT NULL`;
    })().catch((e) => {
      // Reset so a transient failure (e.g. a concurrent DDL race) retries on the
      // next call rather than caching the rejection forever.
      ensured = null;
      throw e;
    });
  }
  return ensured;
}
