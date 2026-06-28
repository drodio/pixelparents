// Change `users.pref_text_alerts` DEFAULT from false → true and backfill
// existing rows. The previous default created a UI mismatch: while the
// phone is unverified the toggle is shown locked-on, but the stored value
// was false; the moment the user verified their phone the toggle would
// visibly snap to off. Aligning the default makes the UI consistent.
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = neon(url);

try {
  await sql`ALTER TABLE "users" ALTER COLUMN "pref_text_alerts" SET DEFAULT true`;
  console.log("OK — column default flipped to true");
  const updated = await sql`UPDATE "users" SET "pref_text_alerts" = true WHERE "pref_text_alerts" = false RETURNING id`;
  console.log(`OK — backfilled ${updated.length} row(s)`);
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
