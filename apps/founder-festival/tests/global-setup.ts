import { neon } from "@neondatabase/serverless";

// Vitest globalSetup — runs ONCE before the suite. The dedicated Neon test branch
// persists across CI runs, so the rate_limit table accumulates abuse counters that
// would eventually trip rate-limit-sensitive tests (redeem, eval/event globals).
// Reset those volatile counters for a clean run. Gated on RESET_VOLATILE_TABLES
// (only the CI gate sets it) and HARD-guarded against the production host so it can
// never truncate prod, even if pointed there by mistake.
export default async function resetVolatileTables() {
  if (process.env.RESET_VOLATILE_TABLES !== "1") return;
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) return;
  if (url.includes("ep-fragrant-surf-aqyi9p6w")) return; // prod host — never touch
  const sql = neon(url);
  await sql`TRUNCATE rate_limit`;
}
