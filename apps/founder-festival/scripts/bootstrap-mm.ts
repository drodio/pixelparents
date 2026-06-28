import { loadCsvIntoNeon } from "@/lib/mm-loader";
import path from "node:path";
import { existsSync } from "node:fs";

async function main() {
  const csvPath = path.resolve("scripts/data/majestic_million.csv");
  if (!existsSync(csvPath)) {
    console.error(`Missing ${csvPath}. Download from https://downloads.majestic.com/majestic_million.csv`);
    process.exit(1);
  }
  console.time("load");
  const n = await loadCsvIntoNeon(csvPath);
  console.timeEnd("load");
  console.log(`loaded ${n} rows`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
