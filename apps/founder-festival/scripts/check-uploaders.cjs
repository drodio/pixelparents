require("dotenv").config({ path: process.argv[2] || ".env.local" });
const { neon } = require("@neondatabase/serverless");
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
(async () => {
  const sql = neon(url);
  console.log("host:", new URL(url).host);
  const rows = await sql`
    SELECT ep.source,
           count(*)::int AS n,
           count(ep.uploaded_by_evaluation_id)::int AS with_uploader,
           count(e.full_name)::int AS with_name
    FROM event_photos ep
    LEFT JOIN evaluations e ON e.id = ep.uploaded_by_evaluation_id
    GROUP BY ep.source ORDER BY ep.source`;
  console.table(rows);
})().catch((e) => { console.error(e.message); process.exit(1); });
