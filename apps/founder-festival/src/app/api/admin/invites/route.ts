// POST /api/admin/invites — create a single-use admin invite + send the
// email. Gated to anyone who can `approve_admin_requests` (super-admins
// always hold all grants).
//
// Body: { email: string, roleId: string | null }
// Returns: { ok: true, id, expiresAt }

import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { requireGrant } from "@/lib/grants";
import { createAdminInvite } from "@/lib/admin-invites";
import { sendAdminInviteEmail } from "@/lib/admin-invite-email";
import { reportServerError } from "@/lib/report-server-error";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://festival.so";

type Body = { email?: unknown; roleId?: unknown };

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  try {
    await requireGrant("approve_admin_requests");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const me = await currentUser().catch(() => null);
  if (!me) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const invitedByEmail =
    me.primaryEmailAddress?.emailAddress ??
    me.emailAddresses?.[0]?.emailAddress ??
    null;
  if (!invitedByEmail) {
    return NextResponse.json({ error: "inviter_email_missing" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.email !== "string") {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }
  const roleId =
    typeof body.roleId === "string" && body.roleId.length > 0 ? body.roleId : null;

  try {
    const invite = await createAdminInvite({
      email: body.email,
      roleId,
      invitedByEmail,
      invitedByClerkUserId: userId,
    });

    const acceptUrl = `${SITE}/admin/accept-invite?token=${encodeURIComponent(invite.token)}`;
    const inviterName = me.firstName ?? me.username ?? invitedByEmail.split("@")[0]!;
    await sendAdminInviteEmail({
      to: invite.email,
      acceptUrl,
      inviterName,
    });

    return NextResponse.json({
      ok: true,
      id: invite.id,
      email: invite.email,
      roleName: invite.roleName,
      expiresAt: invite.expiresAt.toISOString(),
    });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e?.status === 400 && typeof e.message === "string") {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    await reportServerError(err, { route: "POST /api/admin/invites" });
    return NextResponse.json({ error: "invite_failed" }, { status: 500 });
  }
}
