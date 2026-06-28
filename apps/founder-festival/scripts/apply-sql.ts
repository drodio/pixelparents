import "dotenv/config";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const file = process.argv[2];
if (!file) { console.error("usage: tsx scripts/apply-sql.ts <path-to-sql>"); process.exit(1); }

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const text = readFileSync(file, "utf8");
  for (const stmt of text.split("--> statement-breakpoint")) {
    const s = stmt.trim();
    if (s) await sql.query(s);
  }
  console.log("applied", file);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
