import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { scoreItems, users } from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { isOwningConfidence } from "@/lib/identity-match";

// POST /api/score-items — create a new owner-added row.
// Body: { evaluationId, rubric: "founder"|"investor", reason, points? }
//
// Authorization:
//   - Anonymous / non-owner → 403 (the UI opens the Claim modal before
//     reaching this endpoint, but we still gate server-side).
//   - Owner OR admin → INSERT row with source='user', status='pending',
//     confidence=100. Pending status keeps it in the admin review queue.
//
// Defaults: points → 0 if missing. sort_order → max(sort_order)+1 for the
// rubric so the new row appears at the end.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: {
    evaluationId?: string;
    rubric?: string;
    reason?: string;
    points?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { evaluationId, rubric, reason } = body;
  if (!evaluationId) {
    return NextResponse.json({ error: "evaluationId required" }, { status: 400 });
  }
  if (rubric !== "founder" && rubric !== "investor") {
    return NextResponse.json({ error: "rubric must be founder|investor" }, { status: 400 });
  }
  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (!trimmedReason) {
    return NextResponse.json({ error: "reason required" }, { status: 400 });
  }
  const points = typeof body.points === "number" && Number.isFinite(body.points)
    ? Math.round(body.points)
    : 0;

  // Owner OR admin gate.
  const [ownerRow] = await db
    .select({ matchConfidence: users.matchConfidence })
    .from(users)
    .where(and(eq(users.clerkUserId, userId), eq(users.evaluationId, evaluationId)))
    .limit(1);
  const isOwner = !!ownerRow && isOwningConfidence(ownerRow.matchConfidence);
  const admin = await isAdmin();
  if (!isOwner && !admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Sort order: put the new row at the end of the rubric.
  const [maxOrder] = await db
    .select({ s: scoreItems.sortOrder })
    .from(scoreItems)
    .where(and(eq(scoreItems.evaluationId, evaluationId), eq(scoreItems.rubric, rubric)))
    .orderBy(desc(scoreItems.sortOrder))
    .limit(1);
  const sortOrder = (maxOrder?.s ?? -1) + 1;

  const [inserted] = await db
    .insert(scoreItems)
    .values({
      evaluationId,
      rubric,
      reason: trimmedReason,
      points,
      source: "user",
      status: "pending",
      confidence: 100,
      sortOrder,
    })
    .returning();

  return NextResponse.json({ ok: true, item: inserted });
}
