import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isUuid } from "@/lib/canonicalize";
import { isVisibility } from "@/lib/endorsement-constants";
import { addContribution, getEndorsementAuthor } from "@/lib/endorsements";

export const dynamic = "force-dynamic";

// POST /api/endorsements/contribute — a claimed member adds (co-signs) points to
// an existing endorsement. Anonymous users get 401 (the UI tells them to claim).
//
// Body: { endorsementId, points, visibility }
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "claim your profile to add points" }, { status: 401 });
  }

  let body: { endorsementId?: string; points?: number; visibility?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!isUuid(body.endorsementId)) {
    return NextResponse.json({ error: "invalid endorsementId" }, { status: 400 });
  }
  if (!isVisibility(body.visibility)) {
    return NextResponse.json({ error: "invalid visibility" }, { status: 400 });
  }

  const [me] = await db
    .select({ evaluationId: users.evaluationId })
    .from(users)
    .where(and(eq(users.clerkUserId, userId), eq(users.matchConfidence, "high")))
    .limit(1);
  if (!me?.evaluationId) {
    return NextResponse.json({ error: "claim your profile to add points" }, { status: 403 });
  }

  const author = await getEndorsementAuthor(body.endorsementId);
  if (!author) return NextResponse.json({ error: "endorsement not found" }, { status: 404 });
  if (author.fromEvaluationId === me.evaluationId) {
    return NextResponse.json({ error: "you can't add points to your own endorsement" }, { status: 400 });
  }

  const saved = await addContribution({
    endorsementId: body.endorsementId,
    fromEvaluationId: me.evaluationId,
    fromClerkUserId: userId,
    points: Number(body.points) || 0,
    visibility: body.visibility,
  });
  return NextResponse.json({ ok: true, ...saved });
}
