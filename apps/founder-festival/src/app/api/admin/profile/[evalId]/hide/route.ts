// POST /api/admin/profile/[evalId]/hide
//
// Toggles a profile's "hidden from leaderboard" flag. Superadmin-only.
// Body: { hidden: boolean }
//   hidden=true  → set hidden_at = NOW() + hidden_by_clerk_user_id = caller
//   hidden=false → clear both
// Returns: { ok: true, hidden: boolean }
//
// Hidden profiles still resolve at their canonical URL. Only the leaderboard
// query filters them out (see src/lib/leaderboard.ts baseWhere).

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { isSuperAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-api";
import { reportServerError } from "@/lib/report-server-error";

export const dynamic = "force-dynamic";

type Body = { hidden?: unknown };

export async function POST(
  req: Request,
  ctx: { params: Promise<{ evalId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { evalId } = await ctx.params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.hidden !== "boolean") {
    return NextResponse.json({ error: "hidden_required" }, { status: 400 });
  }

  try {
    const [row] = await db
      .select({ id: evaluations.id })
      .from(evaluations)
      .where(eq(evaluations.id, evalId))
      .limit(1);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (body.hidden) {
      await db
        .update(evaluations)
        .set({ hiddenAt: new Date(), hiddenByClerkUserId: userId })
        .where(eq(evaluations.id, evalId));
    } else {
      await db
        .update(evaluations)
        .set({ hiddenAt: null, hiddenByClerkUserId: null })
        .where(eq(evaluations.id, evalId));
    }
    await logAdminAction({
      clerkUserId: userId,
      email: null,
      status: 200,
      req,
      meta: { action: "hide_profile", evalId, hidden: body.hidden },
    });
    return NextResponse.json({ ok: true, hidden: body.hidden });
  } catch (err) {
    await reportServerError(err, {
      route: "POST /api/admin/profile/[evalId]/hide",
      evalId,
      hidden: body.hidden,
    });
    return NextResponse.json({ error: "hide_failed" }, { status: 500 });
  }
}
