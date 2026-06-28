// Backfill event_photos.uploaded_by_evaluation_id for legacy admin photos that
// were uploaded before admin uploads were credited (all null). Two modes:
//
//   1) FIND the right profile (no writes):
//        node scripts/credit-admin-photos.cjs <envfile> [searchTerm]
//      Lists evaluations matching the term by email + name. Default term: "drodio".
//
//   2) BACKFILL (writes): pass an evaluation UUID instead of a search term:
//        node scripts/credit-admin-photos.cjs <envfile> <evaluation-uuid>
//      Sets uploaded_by_evaluation_id on every source='admin' row that is null.
require("dotenv").config({ path: process.argv[2] || ".env.local" });
const { neon } = require("@neondatabase/serverless");
const url =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;

const arg = process.argv[3];
const isUuid = arg && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arg);

(async () => {
  const sql = neon(url);
  console.log("host:", new URL(url).host);

  if (isUuid) {
    const [e] = await sql`SELECT full_name, slug FROM evaluations WHERE id = ${arg}`;
    if (!e) {
      console.error("No evaluation with id", arg);
      process.exit(1);
    }
    const rows = await sql`
      UPDATE event_photos SET uploaded_by_evaluation_id = ${arg}
      WHERE source = 'admin' AND uploaded_by_evaluation_id IS NULL
      RETURNING id`;
    console.log(`Backfilled ${rows.length} admin photos → credited to "${e.full_name}" (${e.slug}).`);
    return;
  }

  const term = `%${arg || "drodio"}%`;
  console.log(`Searching for "${arg || "drodio"}" — pass the right id back to backfill.\n`);
  const byEmail = await sql`
    SELECT e.id, e.full_name, e.slug, pe.email
    FROM profile_emails pe JOIN evaluations e ON e.id = pe.evaluation_id
    WHERE pe.email ILIKE ${term} LIMIT 10`;
  const byName = await sql`
    SELECT id, full_name, slug FROM evaluations WHERE full_name ILIKE ${term} LIMIT 10`;
  console.log("Matches by email:");
  console.table(byEmail);
  console.log("Matches by name:");
  console.table(byName);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
