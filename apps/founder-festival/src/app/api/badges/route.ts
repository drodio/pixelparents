import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { badgeOverrides, users } from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { BADGE_CATALOG } from "@/lib/badges";
import { isOwningConfidence } from "@/lib/identity-match";

// POST /api/badges — set / change the status of a pill on the profile.
// Body shapes:
//   { evaluationId, badgeId, action: "confirm" }
//   { evaluationId, badgeId, action: "reject" }
//   { evaluationId, badgeId, action: "edit",   editedLabel, originalLabel? }
//   { evaluationId, badgeId, action: "add",    editedLabel? }
//
// AUTHORIZATION (mirrors /api/score-items/[id]):
//   - Owner (matchConfidence in high|medium) can confirm/reject likely rows
//     and edit/add (→ pending). Cannot resolve their own pending edit.
//   - Admin can do anything, including resolving a pending row.
type Body =
  | { evaluationId: string; badgeId: string; action: "confirm" }
  | { evaluationId: string; badgeId: string; action: "reject" }
  | { evaluationId: string; badgeId: string; action: "edit"; editedLabel: string; originalLabel?: string }
  | { evaluationId: string; badgeId: string; action: "add"; editedLabel?: string };

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const { evaluationId, badgeId, action } = body;
  if (!evaluationId || !badgeId || !action) {
    return NextResponse.json({ error: "evaluationId, badgeId, action required" }, { status: 400 });
  }
  if (!BADGE_CATALOG[badgeId]) {
    return NextResponse.json({ error: `unknown badgeId: ${badgeId}` }, { status: 400 });
  }

  // Owner or admin.
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

  // Current row (may be absent — that's fine, we'll upsert).
  const [existing] = await db
    .select()
    .from(badgeOverrides)
    .where(and(eq(badgeOverrides.evaluationId, evaluationId), eq(badgeOverrides.badgeId, badgeId)))
    .limit(1);

  // Pending → only admin can resolve.
  if (existing?.status === "pending" && (action === "confirm" || action === "reject") && !admin) {
    return NextResponse.json(
      { error: "admin_required", reason: "Pending pills need admin review before resolving." },
      { status: 403 },
    );
  }

  let nextStatus: "confirmed" | "pending" | "rejected" = "confirmed";
  let editedLabel: string | null = existing?.editedLabel ?? null;
  let originalLabel: string | null = existing?.originalLabel ?? null;

  if (action === "confirm") nextStatus = "confirmed";
  else if (action === "reject") nextStatus = "rejected";
  else if (action === "edit") {
    nextStatus = "pending";
    editedLabel = body.editedLabel?.trim() || null;
    if (!editedLabel) {
      return NextResponse.json({ error: "editedLabel required for edit" }, { status: 400 });
    }
    // Preserve the original label on first edit so admin can see the diff.
    if (originalLabel == null && body.originalLabel) originalLabel = body.originalLabel;
  } else if (action === "add") {
    nextStatus = "pending";
    editedLabel = body.editedLabel?.trim() || BADGE_CATALOG[badgeId].defaultLabel;
  } else {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  // Upsert on (evaluation_id, badge_id) — unique index handles the conflict.
  const [row] = await db
    .insert(badgeOverrides)
    .values({
      evaluationId,
      badgeId,
      status: nextStatus,
      editedLabel,
      originalLabel,
    })
    .onConflictDoUpdate({
      target: [badgeOverrides.evaluationId, badgeOverrides.badgeId],
      set: {
        status: nextStatus,
        editedLabel,
        originalLabel,
        updatedAt: sql`NOW()`,
      },
    })
    .returning();

  return NextResponse.json({ ok: true, override: row });
}
