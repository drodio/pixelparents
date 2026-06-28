// POST /api/admin/profile/[evalId]/merge  { loserIds: string[] }
//
// Superadmin: merge the given loser profiles INTO [evalId] (the winner). The
// winner keeps its own data; losers' relationships (claims, email, attendance,
// photo credit) repoint to the winner, their slugs become winner aliases, then
// the losers are deleted. Irreversible. See src/lib/merge-profiles.ts.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isSuperAdmin } from "@/lib/admin";
import { mergeProfiles } from "@/lib/merge-profiles";
import { logAdminAction } from "@/lib/admin-api";
import { reportServerError } from "@/lib/report-server-error";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ evalId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { evalId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { loserIds?: unknown } | null;
  const loserIds = Array.isArray(body?.loserIds) ? body!.loserIds.filter((x): x is string => typeof x === "string") : [];
  if (loserIds.length === 0) return NextResponse.json({ error: "loserIds required" }, { status: 400 });

  try {
    const result = await mergeProfiles(evalId, loserIds);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.error === "winner_not_found" ? 404 : 400 });
    }
    await logAdminAction({
      clerkUserId: userId,
      email: null,
      status: 200,
      req,
      meta: { action: "merge_profiles", winner: evalId, losers: loserIds },
    });
    return NextResponse.json({ ok: true, merged: result.merged });
  } catch (err) {
    await reportServerError(err, { route: "POST /api/admin/profile/[evalId]/merge", evalId, actor: userId });
    return NextResponse.json({ error: "merge_failed" }, { status: 500 });
  }
}
