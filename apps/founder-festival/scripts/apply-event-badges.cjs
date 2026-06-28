// One-off: create the event category-badge tables (migration 0052) on whichever
// Neon DB the env file points at. Idempotent (IF NOT EXISTS) + additive, so it's
// safe to run on prod BEFORE deploying (old code ignores the tables; new code's
// reads are try/caught).
//
//   Dev:   node scripts/apply-event-badges.cjs
//   Prod:  node scripts/apply-event-badges.cjs /Users/drodio/Projects/founder-festival/.env.prod.local
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
  console.log("Applying event-badge tables to host:", new URL(url).host);
  await sql`CREATE TABLE IF NOT EXISTS event_badges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS event_badges_slug_unique ON event_badges (slug)`;
  await sql`CREATE TABLE IF NOT EXISTS event_badge_links (
    event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    badge_id uuid NOT NULL REFERENCES event_badges(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, badge_id)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS event_badge_links_badge_idx ON event_badge_links (badge_id)`;
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('event_badges','event_badge_links')`;
  console.log("event-badge tables present:", n === 2 ? "yes ✓" : `only ${n}/2 ✗`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
