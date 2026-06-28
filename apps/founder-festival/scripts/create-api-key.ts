import "dotenv/config";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { generateApiKey } from "@/lib/api-keys";

async function main() {
  const owner = process.argv[2] ?? "dev-test-user";
  const label = process.argv[3] ?? "dev test key";
  const { raw, hash, prefix } = generateApiKey();
  await db.insert(apiKeys).values({ clerkUserId: owner, keyHash: hash, keyPrefix: prefix, label });
  console.log("RAW KEY (shown once):", raw);
  console.log("owner:", owner, "prefix:", prefix);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
