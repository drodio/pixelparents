// One-time backfill: copy existing AnyMailFinder emails from the legacy
// evaluations.found_email column into the unified profile_emails table.
//
// Idempotent (ON CONFLICT DO NOTHING via the (evaluation_id, email) unique
// index). Run AFTER migration 0030 is applied, with DATABASE_URL pointed at the
// target DB:
//
//   DATABASE_URL=<postgres-url> npx tsx --require dotenv/config scripts/backfill-profile-emails.ts
//
// NOT run automatically by any migration. Source = 'anymailfinder', status =
// 'unverified' (matching how found_email is displayed today). Also ensures any
// legacy hit row has found_email_status set so the find-email queue never
// re-attempts it (see Plan C eligibility note).
import { db } from "@/db";
import { sql } from "drizzle-orm";

async function main() {
  console.time("backfill");

  const inserted = await db.execute(sql`
    INSERT INTO profile_emails (evaluation_id, email, status, source, added_at, added_by)
    SELECT id, lower(found_email), 'unverified', 'anymailfinder', COALESCE(found_email_at, now()), found_email_by
    FROM evaluations
    WHERE found_email IS NOT NULL
    ON CONFLICT (evaluation_id, email) DO NOTHING
    RETURNING id
  `);
  const insertedRows =
    (inserted as unknown as { rows?: unknown[] }).rows ?? (inserted as unknown as unknown[]);
  const insertedCount = Array.isArray(insertedRows) ? insertedRows.length : 0;

  // Keep migrated hit rows out of the find-email eligible set.
  const fixed = await db.execute(sql`
    UPDATE evaluations
    SET found_email_status = 'valid'
    WHERE found_email IS NOT NULL AND found_email_status IS NULL
    RETURNING id
  `);
  const fixedRows = (fixed as unknown as { rows?: unknown[] }).rows ?? (fixed as unknown as unknown[]);
  const fixedCount = Array.isArray(fixedRows) ? fixedRows.length : 0;

  console.timeEnd("backfill");
  console.log(`profile_emails: inserted ${insertedCount} rows from found_email`);
  console.log(`evaluations: set found_email_status='valid' on ${fixedCount} legacy hit rows`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("backfill failed:", err);
    process.exit(1);
  },
);
