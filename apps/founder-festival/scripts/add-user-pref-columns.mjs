// One-off: add the four pref_* columns to the users table without
// touching any other tables in the dev DB.
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(url);

try {
  await sql`
    ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "pref_invite_events" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "pref_festival_updates" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "pref_sponsor_intros" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "pref_text_alerts" boolean NOT NULL DEFAULT false
  `;
  console.log("OK — added pref_* columns (or already existed)");
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
