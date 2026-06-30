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

// Self-healing guard for the families / co-parent schema (same rationale as
// ensureApiKeysTable above). The signup save path inserts into `families` and
// sets `signups.family_id` / `children.family_id`; on a database that hasn't had
// the families migration applied, those writes throw and EVERY new signup fails
// to save. We create the table + columns idempotently on the first family op per
// cold start so signups work even before a human runs the migration.
//
// Columns are added NULLABLE here on purpose: it's safe on pre-existing rows, and
// new inserts always supply family_id, so nullable is enough to unblock saves.
// The proper migration (0001_supreme_mephisto) still owns the backfill + NOT NULL
// + FK constraints. Statements mirror lib/db/schema/signups.ts and are idempotent.
let familiesEnsured: Promise<void> | null = null;

export function ensureFamiliesSchema(): Promise<void> {
  if (!familiesEnsured) {
    familiesEnsured = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS families (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at timestamptz NOT NULL DEFAULT now(),
          invite_token text NOT NULL UNIQUE
        )
      `;
      await sql`ALTER TABLE signups ADD COLUMN IF NOT EXISTS family_id uuid`;
      await sql`ALTER TABLE children ADD COLUMN IF NOT EXISTS family_id uuid`;
      // Country (lib/db/schema/signups.ts): optional, plotted on the global
      // community map. Nullable + idempotent, same rationale as the columns above.
      await sql`ALTER TABLE signups ADD COLUMN IF NOT EXISTS country text`;
      // Student-email verification (lib/verify.ts): the confirmed OHS student
      // email is recorded per child. Nullable + idempotent, same rationale as
      // the family_id columns above.
      await sql`ALTER TABLE children ADD COLUMN IF NOT EXISTS student_email text`;
    })().catch((e) => {
      familiesEnsured = null;
      throw e;
    });
  }
  return familiesEnsured;
}
