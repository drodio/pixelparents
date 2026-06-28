// Create the Member Endorsements table (endorsements).
// Run with `dev` or `prod`:
//   npx tsx scripts/apply-endorsements-tables.ts dev
//   npx tsx scripts/apply-endorsements-tables.ts prod
// Loads .env.local itself. Migrations apply to prod manually (no auto-migrate on
// deploy) — this IS that manual step, idempotent via CREATE TABLE IF NOT EXISTS,
// so it's safe to re-run. Mirrors scripts/apply-family-tables.ts.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

const target = process.argv[2];
if (target !== "dev" && target !== "prod") throw new Error("usage: apply-endorsements-tables.ts <dev|prod>");
const conn = target === "prod" ? process.env.POSTGRES_URL_NON_POOLING : process.env.DATABASE_URL;
if (!conn) throw new Error(`no connection string for ${target}`);
const host = conn.match(/ep-[a-z-]+/)?.[0] ?? "?";
// Guard: a `prod` run must actually point at the prod Neon branch.
if (target === "prod" && !/ep-fragrant-surf/.test(conn)) throw new Error(`prod target but host is ${host}`);
const sql = neon(conn);

async function main() {
  console.log(`target=${target} host=${host}`);
  await sql`
    CREATE TABLE IF NOT EXISTS endorsements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      evaluation_id uuid NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
      from_evaluation_id uuid NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
      from_clerk_user_id text NOT NULL,
      body text NOT NULL,
      visibility text NOT NULL DEFAULT 'public',
      points integer NOT NULL DEFAULT 0,
      points_visibility text NOT NULL DEFAULT 'public',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS endorsements_evaluation_id_idx ON endorsements(evaluation_id)`;
  await sql`CREATE INDEX IF NOT EXISTS endorsements_from_evaluation_id_idx ON endorsements(from_evaluation_id)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS endorsements_from_to_unique ON endorsements(from_evaluation_id, evaluation_id)`;
  console.log("endorsements table + indexes ready");
}

main().then(() => process.exit(0));
