// Runnable OHS school-year calendar importer. Fetches the OHS gateway page (or
// falls back to the curated seed), parses the school-year events, and UPSERTs them
// into the `events` table as source='ohs' (read-only). Idempotent — re-running
// never duplicates. Use this to seed/refresh OHS events locally or in CI without
// waiting on the Vercel cron.
//
// Usage (loads .env.local automatically; requires DATABASE_URL):
//   npx tsx scripts/import-ohs-events.ts
//
// Prints what it did (live page vs seed fallback, how many parsed/upserted). It
// writes only public school dates — never any PII.

import { config } from "dotenv";
import { resolve } from "node:path";
import { importOhsCalendar } from "../lib/events/import-ohs";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — cannot import. Set it in .env.local.");
    process.exit(1);
  }
  const result = await importOhsCalendar();
  console.log(
    `OHS import complete — source: ${result.source}, parsed: ${result.parsed}, upserted: ${result.upserted}`,
  );
  if (result.source === "seed") {
    console.log(
      "(Used the curated seed fallback — the live OHS page was unreachable or unparseable.)",
    );
  }
}

main().catch((err) => {
  console.error("OHS import failed:", err);
  process.exit(1);
});
