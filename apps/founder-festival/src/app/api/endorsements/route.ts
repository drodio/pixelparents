import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { endorsements, evaluations, users } from "@/db/schema";
import { isUuid } from "@/lib/canonicalize";
import { isVisibility } from "@/lib/endorsement-constants";
import { createOrUpdateEndorsement } from "@/lib/endorsements";
import { sendEndorsementEmail } from "@/lib/endorsement-email";

export const dynamic = "force-dynamic";

// POST /api/endorsements — create/update the caller's endorsement of a profile.
//
// Requirement 7: the ENDORSER must have CLAIMED their own profile (a high-
// confidence users row). The endorsee may be claimed or unclaimed. Self-
// endorsement is rejected. Points + points-visibility are clamped server-side
// (see createOrUpdateEndorsement).
//
// Body: { toEvaluationId, body, visibility, points, pointsVisibility }
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: {
    toEvaluationId?: string;
    body?: string;
    visibility?: string;
    points?: number;
    pointsVisibility?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const toEvaluationId = body.toEvaluationId;
  if (!isUuid(toEvaluationId)) {
    return NextResponse.json({ error: "invalid toEvaluationId" }, { status: 400 });
  }
  const text = (body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "endorsement text required" }, { status: 400 });
  if (!isVisibility(body.visibility) || !isVisibility(body.pointsVisibility)) {
    return NextResponse.json({ error: "invalid visibility" }, { status: 400 });
  }

  // The endorser must be a claimed (high-confidence) member.
  const [me] = await db
    .select({ evaluationId: users.evaluationId })
    .from(users)
    .where(and(eq(users.clerkUserId, userId), eq(users.matchConfidence, "high")))
    .limit(1);
  if (!me?.evaluationId) {
    return NextResponse.json(
      { error: "claim your profile to endorse others" },
      { status: 403 },
    );
  }
  if (me.evaluationId === toEvaluationId) {
    return NextResponse.json({ error: "you can't endorse yourself" }, { status: 400 });
  }

  // The endorsee must exist (claimed or not).
  const [target] = await db
    .select({ id: evaluations.id })
    .from(evaluations)
    .where(eq(evaluations.id, toEvaluationId))
    .limit(1);
  if (!target) return NextResponse.json({ error: "profile not found" }, { status: 404 });

  const saved = await createOrUpdateEndorsement({
    fromEvaluationId: me.evaluationId,
    fromClerkUserId: userId,
    toEvaluationId,
    body: text.slice(0, 4000),
    visibility: body.visibility,
    points: Number(body.points) || 0,
    pointsVisibility: body.pointsVisibility,
  });
  // Notify the (claimed) endorsee — best-effort, deduped, skips private. Awaited
  // so it runs before the serverless function returns.
  await sendEndorsementEmail(saved.id);
  return NextResponse.json({ ok: true, ...saved });
}

// DELETE /api/endorsements — remove the caller's OWN endorsement of a profile.
// Any co-sign contributions cascade-delete (FK onDelete: cascade), which frees
// every contributor's points too. Body: { toEvaluationId }
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { toEvaluationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const toEvaluationId = body.toEvaluationId;
  if (!isUuid(toEvaluationId)) {
    return NextResponse.json({ error: "invalid toEvaluationId" }, { status: 400 });
  }

  // Only a claimed member can have an endorsement to delete; scope the delete to
  // THEIR row so a caller can never remove someone else's endorsement.
  const [me] = await db
    .select({ evaluationId: users.evaluationId })
    .from(users)
    .where(and(eq(users.clerkUserId, userId), eq(users.matchConfidence, "high")))
    .limit(1);
  if (!me?.evaluationId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const deleted = await db
    .delete(endorsements)
    .where(and(eq(endorsements.fromEvaluationId, me.evaluationId), eq(endorsements.evaluationId, toEvaluationId)))
    .returning({ id: endorsements.id });
  return NextResponse.json({ ok: true, deleted: deleted.length });
}
