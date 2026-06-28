import "dotenv/config";
import { db } from "@/db";
import { creditBalances } from "@/db/schema";
import { eq } from "drizzle-orm";

const clerkUserId = process.argv[2] ?? "dev-test-user";
const balanceCents = Number(process.argv[3] ?? "100000");

async function main() {
  await db
    .insert(creditBalances)
    .values({ clerkUserId, balanceCents })
    .onConflictDoUpdate({
      target: creditBalances.clerkUserId,
      set: { balanceCents },
    });
  console.log(`set balance for ${clerkUserId} → ${balanceCents} cents`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
