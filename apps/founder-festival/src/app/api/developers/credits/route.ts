import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { creditLedger, evaluations } from "@/db/schema";
import { getBalanceCents } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const balance_cents = await getBalanceCents(userId);
  // leftJoin the eval so a scoring debit can show WHO was scored (name or
  // handle), not just "-$X.XX". leftJoin keeps topups/refunds (no eval) too.
  const rows = await db
    .select({
      deltaCents: creditLedger.deltaCents,
      reason: creditLedger.reason,
      createdAt: creditLedger.createdAt,
      evaluationId: creditLedger.evaluationId,
      fullName: evaluations.fullName,
      linkedinUrl: evaluations.linkedinUrl,
    })
    .from(creditLedger)
    .leftJoin(evaluations, eq(evaluations.id, creditLedger.evaluationId))
    .where(eq(creditLedger.clerkUserId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(100);
  const ledger = rows.map((r) => ({
    deltaCents: r.deltaCents,
    reason: r.reason,
    createdAt: r.createdAt,
    // The scored person on score_debit/refund rows: prefer the name, else the
    // linkedin handle. Null for topups. `evaluationId` lets the UI link to the
    // profile (/profile?e=<id>).
    evaluationId: r.evaluationId,
    subject:
      r.fullName ||
      (r.linkedinUrl
        ? r.linkedinUrl.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "")
        : null),
  }));
  return NextResponse.json({ balance_cents, ledger });
}
