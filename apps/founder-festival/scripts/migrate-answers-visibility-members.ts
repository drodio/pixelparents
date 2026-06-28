// One-time data migration for the 3-way answers visibility: existing
// recommendation_visibility rows marked 'private' meant "members only" under the
// old 2-way model (the old hover text literally said "Private to members only").
// Remap them to 'members_only' so the new true 'private' can mean owner-only.
//
// Run with `dev` or `prod`:
//   npx tsx scripts/migrate-answers-visibility-members.ts dev
//   npx tsx scripts/migrate-answers-visibility-members.ts prod
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

const target = process.argv[2];
if (target !== "dev" && target !== "prod") {
  throw new Error("usage: migrate-answers-visibility-members.ts <dev|prod>");
}
const conn = target === "prod" ? process.env.POSTGRES_URL_NON_POOLING : process.env.DATABASE_URL;
if (!conn) throw new Error(`no connection string for ${target}`);
const host = conn.match(/ep-[a-z-]+/)?.[0] ?? "?";
if (target === "prod" && !/ep-fragrant-surf/.test(conn)) throw new Error(`prod target but host is ${host}`);
if (target === "dev" && /ep-fragrant-surf/.test(conn)) throw new Error(`dev target but host IS prod`);
const sql = neon(conn);

async function main() {
  console.log(`target=${target} host=${host}`);
  const before = await sql`SELECT visibility, COUNT(*)::int AS n FROM recommendation_visibility GROUP BY visibility ORDER BY n DESC`;
  console.log("before:", JSON.stringify(before));
  const updated = await sql`UPDATE recommendation_visibility SET visibility = 'members_only', updated_at = NOW() WHERE visibility = 'private' RETURNING evaluation_id`;
  console.log(`remapped ${updated.length} private answer(s) -> members_only`);
  const after = await sql`SELECT visibility, COUNT(*)::int AS n FROM recommendation_visibility GROUP BY visibility ORDER BY n DESC`;
  console.log("after:", JSON.stringify(after));
}

main().then(() => process.exit(0));
