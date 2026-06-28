// One-off diagnostic: look up an evaluation by name fragment and print
// the mmHits + extractedMetrics so we can explain why a particular
// badge fired (or didn't).
//
// Usage: node --env-file=.env.local scripts/inspect-eval.mjs "Erika"
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = neon(url);

const needle = process.argv[2];
if (!needle) {
  console.error("usage: inspect-eval.mjs <name fragment>");
  process.exit(1);
}

try {
  const rows = await sql`
    SELECT id, full_name, linkedin_url, score, founder_score, investor_score,
           profile -> 'mmHits' AS mm_hits,
           profile -> 'extractedMetrics' AS extracted_metrics,
           breakdown
    FROM evaluations
    WHERE full_name ILIKE ${"%" + needle + "%"}
    ORDER BY created_at DESC
    LIMIT 5
  `;
  if (rows.length === 0) {
    console.log(`No matches for "${needle}"`);
    process.exit(0);
  }
  for (const r of rows) {
    console.log("=".repeat(60));
    console.log("name:        ", r.full_name);
    console.log("linkedin:    ", r.linkedin_url);
    console.log("score:       ", r.score, "(F", r.founder_score, "+ I", r.investor_score, ")");
    console.log("mmHits:      ", JSON.stringify(r.mm_hits, null, 2));
    console.log("extracted:   ", JSON.stringify(r.extracted_metrics, null, 2));
    // Print just founder breakdown reasons + points
    const b = r.breakdown ?? {};
    const founderItems = Array.isArray(b) ? b : (b.founder ?? []);
    for (const item of founderItems) {
      console.log(`  +${item.points} ${item.reason}`);
    }
  }
} catch (err) {
  console.error("FAILED:", err.message);
  process.exit(1);
}
