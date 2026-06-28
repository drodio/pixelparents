import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, evaluations } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

// POST /api/account/clear-phone — the signed-in user removes the operator/CSV
// "on file" phone (evaluations.phone) from their claimed profile(s). Does NOT
// touch their Clerk-verified phone (managed via the normal Clerk flow). A user
// may have several claim rows (re-sign-ins); clear the phone on all their evals.
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const claimed = await db
    .select({ evalId: users.evaluationId })
    .from(users)
    .where(eq(users.clerkUserId, userId));
  const ids = claimed.map((c) => c.evalId).filter((x): x is string => !!x);
  if (ids.length > 0) {
    await db.update(evaluations).set({ phone: null }).where(inArray(evaluations.id, ids));
  }
  return NextResponse.json({ ok: true });
}
