import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { scoreItems, users, evaluations, profileEmails } from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { isOwningConfidence } from "@/lib/identity-match";
import { sendClaimApprovalEmail } from "@/lib/claim-email";

// When an admin APPROVES an owner-edited row (was pending), the headline score
// must move (founder_score is a plain sum of row points, so the change is exactly
// points − originalPoints) and we email the owner. Best-effort: a failure here must
// never block the approval itself.
async function applyApprovalSideEffects(item: typeof scoreItems.$inferSelect): Promise<void> {
  const delta = item.points - (item.originalPoints ?? item.points);
  const [ev] = await db
    .select({
      founderScore: evaluations.founderScore,
      investorScore: evaluations.investorScore,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
      fullName: evaluations.fullName,
    })
    .from(evaluations)
    .where(eq(evaluations.id, item.evaluationId))
    .limit(1);
  if (!ev) return;
  const oldCombined = (ev.founderScore ?? 0) + (ev.investorScore ?? 0);
  const isFounder = item.rubric === "founder";
  const newFounder = (ev.founderScore ?? 0) + (isFounder ? delta : 0);
  const newInvestor = (ev.investorScore ?? 0) + (isFounder ? 0 : delta);
  const newCombined = oldCombined + delta;
  if (delta !== 0) {
    await db
      .update(evaluations)
      .set({ founderScore: newFounder, investorScore: newInvestor, score: newCombined, updatedAt: new Date() })
      .where(eq(evaluations.id, item.evaluationId));
  }
  try {
    const [pe] = await db
      .select({ email: profileEmails.email })
      .from(profileEmails)
      .where(and(eq(profileEmails.evaluationId, item.evaluationId), eq(profileEmails.status, "verified")))
      .limit(1);
    if (pe?.email && ev.slug && ev.slugKind) {
      const firstName = (ev.fullName ?? "there").trim().split(/\s+/)[0] || "there";
      await sendClaimApprovalEmail({
        to: pe.email,
        firstName,
        profileUrl: `https://festival.so/profile/${ev.slugKind}/${ev.slug}`,
        originalScore: oldCombined,
        newScore: newCombined,
        newClaim: item.reason,
        originalClaim: item.originalReason,
      });
    }
  } catch {
    // email failure must not block the approval
  }
}

// POST /api/score-items/[id]
//
// Per-row actions on a founder/investor breakdown row. Body:
//   { action: "confirm" }
//   { action: "reject" }
//   { action: "modify", reason: string, points?: number }
//
// AUTHORIZATION:
// - Owner (Clerk session whose users.matchConfidence is high|medium on this
//   eval): can ALWAYS modify (→ pending), and can confirm/reject rows in
//   status='likely' (i.e. the AI's original output, untouched by a human).
// - Admin (email in ADMIN_EMAILS): can confirm/reject ANY row, including
//   rows already in status='pending' — that's how owner-edits get reviewed.
//
// Net: an owner moving a row from likely → confirmed/rejected doesn't need
// admin sign-off (they're confirming the AI's read of their own life).
// But once a row is in pending (because the owner edited the text/points),
// only admin can flip it to confirmed or rejected. This prevents
// self-confirmation of arbitrary owner-written claims.
type Body =
  | { action: "confirm" }
  | { action: "reject" }
  | { action: "modify"; reason: string; points?: number };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const [item] = await db
    .select()
    .from(scoreItems)
    .where(eq(scoreItems.id, id))
    .limit(1);
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [ownerRow] = await db
    .select({ matchConfidence: users.matchConfidence })
    .from(users)
    .where(
      and(eq(users.clerkUserId, userId), eq(users.evaluationId, item.evaluationId)),
    )
    .limit(1);
  const isOwner = !!ownerRow && isOwningConfidence(ownerRow.matchConfidence);
  const admin = await isAdmin();
  if (!isOwner && !admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (body.action === "confirm") {
    // Owners can confirm the AI's original output (likely → confirmed).
    // Only admin can confirm a row that was previously modified into pending.
    if (item.status === "pending" && !admin) {
      return NextResponse.json(
        { error: "admin_required", reason: "Pending items need admin review before they can be confirmed." },
        { status: 403 },
      );
    }
    // An admin approving a previously-pending owner-edit → move the score + email.
    const wasOwnerEditApproval = item.status === "pending" && admin;
    const [updated] = await db
      .update(scoreItems)
      .set({ status: "confirmed", confidence: 100, updatedAt: new Date() })
      .where(eq(scoreItems.id, id))
      .returning();
    if (wasOwnerEditApproval) {
      try {
        await applyApprovalSideEffects(item);
      } catch {
        // never block the approval on the side-effects
      }
    }
    return NextResponse.json({ ok: true, item: updated });
  }

  if (body.action === "reject") {
    // Mirror confirm: owner can reject the AI's original output; only
    // admin can dismiss a pending owner-edit as rejected.
    if (item.status === "pending" && !admin) {
      return NextResponse.json(
        { error: "admin_required", reason: "Pending items need admin review before they can be rejected." },
        { status: 403 },
      );
    }
    const [updated] = await db
      .update(scoreItems)
      .set({ status: "rejected", confidence: 0, updatedAt: new Date() })
      .where(eq(scoreItems.id, id))
      .returning();
    return NextResponse.json({ ok: true, item: updated });
  }

  if (body.action === "modify") {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    // Preserve the original on first edit so the admin queue can show a diff.
    const originalReason = item.originalReason ?? item.reason;
    const originalPoints = item.originalPoints ?? item.points;
    // Clamp admin-supplied points: integer within ±100 (a row's contribution is
    // a small bounded value; founder_score is a plain sum of these). Reject junk
    // rather than letting a fat-fingered / hostile value distort the total.
    let nextPoints = item.points;
    if (body.points != null) {
      if (typeof body.points !== "number" || !Number.isInteger(body.points) || Math.abs(body.points) > 100) {
        return NextResponse.json({ error: "points must be an integer within ±100" }, { status: 400 });
      }
      nextPoints = body.points;
    }
    const [updated] = await db
      .update(scoreItems)
      .set({
        reason,
        points: nextPoints,
        status: "pending",
        confidence: 100,
        originalReason,
        originalPoints,
        updatedAt: new Date(),
      })
      .where(eq(scoreItems.id, id))
      .returning();
    return NextResponse.json({ ok: true, item: updated });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
