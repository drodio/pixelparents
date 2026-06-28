// POST /api/admin/profile/[evalId]/delete
//
// Superadmin-initiated profile deletion. Irreversible. Cascades the eval
// row and all its dependents via deleteEvaluationsCascade. Does NOT touch
// the underlying Clerk user (the auth identity persists in case the user
// has API keys or other accounts associated; a separate cleanup can
// follow). The user-initiated delete (/api/account/delete) is the path
// that also deletes the Clerk user.
//
// Body: none. Returns: { ok: true }.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { isSuperAdmin } from "@/lib/admin";
import { deleteEvaluationsCascade } from "@/lib/profile-delete-cascade";
import { logAdminAction } from "@/lib/admin-api";
import { reportServerError } from "@/lib/report-server-error";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ evalId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { evalId } = await ctx.params;

  try {
    const [row] = await db
      .select({ id: evaluations.id })
      .from(evaluations)
      .where(eq(evaluations.id, evalId))
      .limit(1);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await deleteEvaluationsCascade([evalId]);
    await logAdminAction({
      clerkUserId: userId,
      email: null,
      status: 200,
      req: _req,
      meta: { action: "delete_profile", evalId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await reportServerError(err, {
      route: "POST /api/admin/profile/[evalId]/delete",
      evalId,
      actor: userId,
    });
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
