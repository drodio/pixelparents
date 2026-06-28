// POST /api/admin/invites/redeem — redeems an invite token.
//
// Body: { token: string }
//
// Validates the signed-in user's verified Clerk emails contain the invited
// email (case-insensitive). On success: marks the invite redeemed and
// upserts admin_access for the Clerk user to status="approved".
//
// Returns:
//   200 { ok: true, roleName, invitedByEmail }
//   400 { error: "token_required" }
//   401 { error: "unauthenticated" }
//   403 { error: "email_mismatch", invitedEmail }
//   404 { error: "not_found" | "expired" | "already_redeemed" }

import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redeemAdminInvite } from "@/lib/admin-invites";
import { reportServerError } from "@/lib/report-server-error";

export const dynamic = "force-dynamic";

type Body = { token?: unknown };

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.token !== "string" || body.token.length < 16) {
    return NextResponse.json({ error: "token_required" }, { status: 400 });
  }

  const me = await currentUser().catch(() => null);
  if (!me) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const verifiedEmails = (me.emailAddresses ?? [])
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress);
  const primaryEmail = me.primaryEmailAddress?.emailAddress ?? null;
  const imageUrl = me.imageUrl ?? null;
  const name = [me.firstName, me.lastName].filter(Boolean).join(" ") || me.username || null;

  try {
    const result = await redeemAdminInvite({
      token: body.token,
      clerkUserId: userId,
      verifiedEmails,
      recipientName: name,
      recipientImageUrl: imageUrl,
      recipientPrimaryEmail: primaryEmail,
    });

    if (!result.ok) {
      const status =
        result.code === "email_mismatch"
          ? 403
          : result.code === "not_found" || result.code === "expired" || result.code === "already_redeemed"
            ? 404
            : 400;
      return NextResponse.json(
        { error: result.code, ...(result.detail ? { invitedEmail: result.detail } : {}) },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      roleName: result.roleName,
      invitedByEmail: result.invitedByEmail,
    });
  } catch (err) {
    await reportServerError(err, { route: "POST /api/admin/invites/redeem" });
    return NextResponse.json({ error: "redeem_failed" }, { status: 500 });
  }
}
