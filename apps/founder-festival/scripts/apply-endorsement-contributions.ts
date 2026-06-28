// Create the endorsement_contributions table (co-signs / upvotes).
//   npx tsx scripts/apply-endorsement-contributions.ts dev
//   npx tsx scripts/apply-endorsement-contributions.ts prod
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
const target = process.argv[2];
if (target !== "dev" && target !== "prod") throw new Error("usage: apply-endorsement-contributions.ts <dev|prod>");
const conn = target === "prod" ? process.env.POSTGRES_URL_NON_POOLING : process.env.DATABASE_URL;
if (!conn) throw new Error(`no connection string for ${target}`);
const host = conn.match(/ep-[a-z-]+/)?.[0] ?? "?";
if (target === "prod" && !/ep-fragrant-surf/.test(conn)) throw new Error(`prod target but host is ${host}`);
const sql = neon(conn);
async function main() {
  console.log(`target=${target} host=${host}`);
  await sql`
    CREATE TABLE IF NOT EXISTS endorsement_contributions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      endorsement_id uuid NOT NULL REFERENCES endorsements(id) ON DELETE CASCADE,
      from_evaluation_id uuid NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
      from_clerk_user_id text NOT NULL,
      points integer NOT NULL DEFAULT 0,
      visibility text NOT NULL DEFAULT 'public',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS endorsement_contributions_endorsement_id_idx ON endorsement_contributions(endorsement_id)`;
  await sql`CREATE INDEX IF NOT EXISTS endorsement_contributions_from_evaluation_id_idx ON endorsement_contributions(from_evaluation_id)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS endorsement_contributions_unique ON endorsement_contributions(endorsement_id, from_evaluation_id)`;
  console.log("endorsement_contributions ready");
}
main().then(() => process.exit(0));
