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
      // All idempotent DDL in ONE round-trip (was ~11 sequential ~1s on cold start).
      // CREATE handles a dropped table; the ALTERs upgrade an older table in place.
      await sql.transaction([
        sql`
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
          request_count integer NOT NULL DEFAULT 0,
          tier text,
          label text,
          approved_at timestamptz
        )
      `,
        sql`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS clerk_user_id text`,
        sql`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'`,
        sql`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS decided_at timestamptz`,
        sql`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS decided_by text`,
        sql`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS reject_reason text`,
        sql`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revealed_at timestamptz`,
        sql`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS request_count integer NOT NULL DEFAULT 0`,
        // Keys no longer exist at request time, so these must be nullable.
        sql`ALTER TABLE api_keys ALTER COLUMN key_hash DROP NOT NULL`,
        sql`ALTER TABLE api_keys ALTER COLUMN key_prefix DROP NOT NULL`,
        // Legacy `tier` was NOT NULL DEFAULT 'public'; relax it (one gate now).
        sql`ALTER TABLE api_keys ALTER COLUMN tier DROP NOT NULL`,
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
      // All idempotent DDL in ONE round-trip (was 5 sequential ~750ms on cold
      // start, on the dashboard/directory hot read path via getSignupByEmail).
      await sql.transaction([
        sql`
        CREATE TABLE IF NOT EXISTS families (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at timestamptz NOT NULL DEFAULT now(),
          invite_token text NOT NULL UNIQUE
        )
      `,
        sql`ALTER TABLE signups ADD COLUMN IF NOT EXISTS family_id uuid`,
        sql`ALTER TABLE children ADD COLUMN IF NOT EXISTS family_id uuid`,
        // Country: optional, plotted on the global community map. Nullable + idempotent.
        sql`ALTER TABLE signups ADD COLUMN IF NOT EXISTS country text`,
        // Student-email verification: confirmed OHS student email, recorded per child.
        sql`ALTER TABLE children ADD COLUMN IF NOT EXISTS student_email text`,
      ]);
    })().catch((e) => {
      familiesEnsured = null;
      throw e;
    });
  }
  return familiesEnsured;
}

// Self-healing guard for the OHS asks → expertise-matching connector (same
// rationale as the guards above: this app shares one Neon DB with features that
// run their own partial `drizzle-kit push`, and there is NO migrate-on-deploy, so
// a brand-new table won't exist until a human migrates — by which point every
// asks read/write would throw). We create `asks` + `ask_responses` idempotently
// on the first asks op per cold start so the surface works immediately. Every
// read/write path in lib/db/asks.ts calls this first (the country-column P0
// lesson: new tables MUST be self-healed AND read paths must invoke the ensure).
//
// Statements mirror lib/db/schema/asks.ts. CREATE handles a dropped table; the
// ALTERs upgrade an older table in place. All idempotent, in ONE round-trip.
let asksEnsured: Promise<void> | null = null;

export function ensureAsksSchema(): Promise<void> {
  if (!asksEnsured) {
    asksEnsured = (async () => {
      const sql = getSql();
      await sql.transaction([
        sql`
        CREATE TABLE IF NOT EXISTS asks (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          author_signup_id uuid NOT NULL REFERENCES signups(id) ON DELETE CASCADE,
          author_clerk_id text,
          kind text NOT NULL DEFAULT 'ask',
          title text NOT NULL,
          body text NOT NULL,
          expertise_tags text[],
          urgency text NOT NULL DEFAULT 'normal',
          valid_until timestamptz,
          status text NOT NULL DEFAULT 'open',
          resolved_at timestamptz
        )
      `,
        sql`
        CREATE TABLE IF NOT EXISTS ask_responses (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at timestamptz NOT NULL DEFAULT now(),
          ask_id uuid NOT NULL REFERENCES asks(id) ON DELETE CASCADE,
          responder_signup_id uuid NOT NULL REFERENCES signups(id) ON DELETE CASCADE,
          responder_clerk_id text,
          offer text NOT NULL,
          proposes text NOT NULL DEFAULT 'async',
          status text NOT NULL DEFAULT 'offered',
          decided_at timestamptz
        )
      `,
        // Idempotent upgrades for an older `asks`/`ask_responses` shape.
        sql`ALTER TABLE asks ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`,
        sql`ALTER TABLE asks ADD COLUMN IF NOT EXISTS author_clerk_id text`,
        sql`ALTER TABLE asks ADD COLUMN IF NOT EXISTS expertise_tags text[]`,
        sql`ALTER TABLE asks ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open'`,
        // Exchange (bidirectional) columns — added idempotently so an older
        // one-directional `asks` table upgrades in place (the country-column P0
        // lesson: new columns must self-heal AND read paths must call ensure).
        sql`ALTER TABLE asks ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'ask'`,
        sql`ALTER TABLE asks ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'normal'`,
        sql`ALTER TABLE asks ADD COLUMN IF NOT EXISTS valid_until timestamptz`,
        sql`ALTER TABLE asks ADD COLUMN IF NOT EXISTS resolved_at timestamptz`,
        sql`ALTER TABLE ask_responses ADD COLUMN IF NOT EXISTS responder_clerk_id text`,
        sql`ALTER TABLE ask_responses ADD COLUMN IF NOT EXISTS proposes text NOT NULL DEFAULT 'async'`,
        sql`ALTER TABLE ask_responses ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'offered'`,
        sql`ALTER TABLE ask_responses ADD COLUMN IF NOT EXISTS decided_at timestamptz`,
        // Helpful indexes for the board (open posts oldest-first) + kind split +
        // per-post responses.
        sql`CREATE INDEX IF NOT EXISTS asks_status_created_idx ON asks (status, created_at DESC)`,
        sql`CREATE INDEX IF NOT EXISTS asks_kind_status_idx ON asks (kind, status)`,
        sql`CREATE INDEX IF NOT EXISTS ask_responses_ask_idx ON ask_responses (ask_id)`,
      ]);
    })().catch((e) => {
      asksEnsured = null;
      throw e;
    });
  }
  return asksEnsured;
}
