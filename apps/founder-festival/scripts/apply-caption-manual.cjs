// One-off: add event_photos.caption_manual (migration 0041) to whichever Neon DB
// the given env file points at. Idempotent (IF NOT EXISTS) and backward-compatible
// — old code ignores the column, so it's safe to run on prod BEFORE deploying.
//
//   Dev:   node scripts/apply-caption-manual.cjs            (uses .env.local)
//   Prod:  node scripts/apply-caption-manual.cjs /Users/drodio/Projects/founder-festival/.env.prod.local
const envPath = process.argv[2] || ".env.local";
require("dotenv").config({ path: envPath });
const { neon } = require("@neondatabase/serverless");
// Prod env files (vercel env pull) redact DATABASE_URL* but keep the Neon
// POSTGRES_URL_NON_POOLING / POSTGRES_URL strings — fall back to those.
const url =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;
if (!url) {
  console.error("No usable Postgres URL in", envPath);
  process.exit(1);
}
(async () => {
  const sql = neon(url);
  console.log("Applying caption_manual to host:", new URL(url).host);
  await sql`ALTER TABLE event_photos ADD COLUMN IF NOT EXISTS caption_manual boolean NOT NULL DEFAULT false`;
  const [row] = await sql`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='event_photos' AND column_name='caption_manual'`;
  console.log("caption_manual present:", row.n === 1 ? "yes ✓" : "NO ✗");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
