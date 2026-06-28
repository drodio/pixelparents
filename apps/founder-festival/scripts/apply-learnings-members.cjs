// One-off: add events.learnings_members (migration 0053). Idempotent + additive.
// Apply to prod BEFORE deploying — getEventBySlug does SELECT *, so a missing
// column 500s the event pages.
//   Dev:  node scripts/apply-learnings-members.cjs
//   Prod: node scripts/apply-learnings-members.cjs /Users/drodio/Projects/founder-festival/.env.prod.local
require("dotenv").config({ path: process.argv[2] || ".env.local" });
const { neon } = require("@neondatabase/serverless");
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) { console.error("No usable Postgres URL in", process.argv[2] || ".env.local"); process.exit(1); }
(async () => {
  const sql = neon(url);
  console.log("Applying learnings_members to host:", new URL(url).host);
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS learnings_members text`;
  const [r] = await sql`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='events' AND column_name='learnings_members'`;
  console.log("learnings_members present:", r.n === 1 ? "yes ✓" : "NO ✗");
})().catch((e) => { console.error(e.message); process.exit(1); });
