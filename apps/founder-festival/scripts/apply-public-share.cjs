// One-off: add family_members.public_share (migration 0045) to whichever Neon DB
// the given env file points at. Idempotent + backward-compatible (old code ignores
// it), but the NEW code's SELECT * over family_members needs the column, so apply
// to prod BEFORE deploying or the family section degrades to hidden.
//
//   Dev:   node scripts/apply-public-share.cjs
//   Prod:  node scripts/apply-public-share.cjs /Users/drodio/Projects/founder-festival/.env.prod.local
require("dotenv").config({ path: process.argv[2] || ".env.local" });
const { neon } = require("@neondatabase/serverless");
const url =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;
if (!url) {
  console.error("No usable Postgres URL in", process.argv[2] || ".env.local");
  process.exit(1);
}
(async () => {
  const sql = neon(url);
  console.log("Applying public_share to host:", new URL(url).host);
  await sql`ALTER TABLE family_members ADD COLUMN IF NOT EXISTS public_share text NOT NULL DEFAULT 'none'`;
  const [row] = await sql`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='family_members' AND column_name='public_share'`;
  console.log("public_share present:", row.n === 1 ? "yes ✓" : "NO ✗");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
