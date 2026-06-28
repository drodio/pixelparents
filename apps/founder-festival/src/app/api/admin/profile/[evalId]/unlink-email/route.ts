// POST /api/admin/profile/[evalId]/unlink-email  { email }
//
// Superadmin: detach ONE email from a profile (the "Un-link Email" action on a
// profile conflict). Removes the profile_emails row for (evalId, email) — the
// profile itself is untouched. Resolves a mis-link where the same email was
// attached to two different people: un-link it from the wrong one.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { profileEmails } from "@/db/schema";
import { isSuperAdmin } from "@/lib/admin";
import { normalizeEmail } from "@/lib/profile-emails";
import { logAdminAction } from "@/lib/admin-api";
import { reportServerError } from "@/lib/report-server-error";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ evalId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { evalId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  try {
    const deleted = await db
      .delete(profileEmails)
      .where(and(eq(profileEmails.evaluationId, evalId), eq(profileEmails.email, email)))
      .returning({ id: profileEmails.id });
    await logAdminAction({
      clerkUserId: userId,
      email: null,
      status: 200,
      req,
      meta: { action: "unlink_email", evalId, email, removed: deleted.length },
    });
    return NextResponse.json({ ok: true, removed: deleted.length });
  } catch (err) {
    await reportServerError(err, { route: "POST /api/admin/profile/[evalId]/unlink-email", evalId, actor: userId });
    return NextResponse.json({ error: "unlink_failed" }, { status: 500 });
  }
}
