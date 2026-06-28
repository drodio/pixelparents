import { db } from "@/db";
import { bypassCodes } from "@/db/schema";

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [k, v] = arg.replace(/^--/, "").split("=");
      return [k, v];
    }),
  );
  const code = args.code;
  const maxUses = Number(args.maxUses ?? 1);
  const assignedScore = args.score ? Number(args.score) : undefined;
  const expiresAt = args.expires ? new Date(args.expires) : undefined;
  const note = args.note;
  if (!code) {
    console.error("Usage: pnpm insert-code --code=ABC123 --maxUses=5 --score=50 --expires=2026-07-01 --note='friends'");
    process.exit(1);
  }
  const [row] = await db
    .insert(bypassCodes)
    .values({ code, maxUses, assignedScore, expiresAt, note })
    .returning();
  console.log("inserted:", row);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
