// Operator helper. Wipes the rate_limit table so all IPs reset to zero.
// Run with: pnpm exec tsx --require dotenv/config scripts/clear-rate-limit.ts
// (with DOTENV_CONFIG_PATH=.env.local in env if needed)
import { db } from "@/db";
import { sql } from "drizzle-orm";

async function main() {
  const r = await db.execute(sql`DELETE FROM rate_limit`);
  console.log("cleared rate_limit:", r);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
