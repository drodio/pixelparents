import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { recommendationVisibility } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { isEvalOwner } from "@/lib/authz";
import { isAdmin } from "@/lib/admin";

// Same gate as /api/recommendations: caller must own the evaluation (claimed
// it) or be an admin. Returns a NextResponse to short-circuit, or null when
// authorized.
async function gate(evaluationId: string): Promise<NextResponse | null> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await isEvalOwner(userId, evaluationId)) && !(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

// POST /api/recommendations/visibility — set the public/private state of one
// priority row. The recommendation_visibility table is sparse: a row exists
// only when the priority is private. Setting back to public deletes the row.
//
// Body: { evaluationId, itemId, visibility: "public" | "private" }
export async function POST(req: Request) {
  let body: { evaluationId?: string; itemId?: string; visibility?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { evaluationId, itemId, visibility } = body;
  if (!evaluationId || !itemId) {
    return NextResponse.json({ error: "evaluationId and itemId required" }, { status: 400 });
  }
  if (visibility !== "public" && visibility !== "members_only" && visibility !== "private") {
    return NextResponse.json(
      { error: "visibility must be public, members_only, or private" },
      { status: 400 },
    );
  }
  const denied = await gate(evaluationId);
  if (denied) return denied;

  // Sparse table: a row exists only for non-public answers (members_only or
  // private). Setting public deletes the row.
  if (visibility !== "public") {
    await db
      .insert(recommendationVisibility)
      .values({ evaluationId, itemId, visibility })
      .onConflictDoUpdate({
        target: [recommendationVisibility.evaluationId, recommendationVisibility.itemId],
        set: { visibility, updatedAt: sql`NOW()` },
      });
  } else {
    await db
      .delete(recommendationVisibility)
      .where(
        and(
          eq(recommendationVisibility.evaluationId, evaluationId),
          eq(recommendationVisibility.itemId, itemId),
        ),
      );
  }

  return NextResponse.json({ ok: true });
}
